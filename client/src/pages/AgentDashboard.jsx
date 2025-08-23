import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { createSocket } from '../socket';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
	iconRetinaUrl: markerIcon2x,
	iconUrl: markerIcon,
	shadowUrl: markerShadow,
});

// AGENT_STATUSES will be defined inside the component where translations are available

function Navbar({ onLogout, user }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">C</div>
          <span className="font-semibold">{t.courierManager}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">{user?.name} <span className="text-gray-400">• {user?.role}</span></div>
          <LanguageSwitcher />
          <button onClick={onLogout} className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">{t.logout}</button>
        </div>
      </div>
    </header>
  );
}

function LiveMap({ agentPosition }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const agentMarkerRef = useRef(null);

  const ensureMap = useCallback((center = [23.78, 90.41], zoom = 12) => {
    if (!mapRef.current && mapElRef.current) {
      mapRef.current = L.map(mapElRef.current).setView(center, zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }
    return mapRef.current;
  }, []);

  useEffect(() => {
    if (!agentPosition) return;
    const map = ensureMap(agentPosition, 13);
    if (!map) return;
    const icon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    if (!agentMarkerRef.current) {
      agentMarkerRef.current = L.marker(agentPosition, { icon }).addTo(map);
      map.setView(agentPosition, 14, { animate: true });
    } else {
      agentMarkerRef.current.setLatLng(agentPosition);
      const bounds = map.getBounds();
      if (!bounds.contains(agentPosition)) map.panTo(agentPosition);
    }
  }, [agentPosition, ensureMap]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold">{t.liveMap}</h3>
      <div ref={mapElRef} className="h-96 w-full overflow-hidden rounded-lg" />
    </div>
  );
}

export default function AgentDashboard() {
  const { user, logout } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  const [parcels, setParcels] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [agentPosition, setAgentPosition] = useState(null);
  const geoWatchIdRef = useRef(null);
  const [otpModal, setOtpModal] = useState({ open: false, parcelId: null, step: 'request', code: '', sending: false, error: '' });

  // Create user-specific socket
  useEffect(() => {
    if (user?._id) {
      const userSocket = createSocket(user._id);
      setSocket(userSocket);
      
      return () => {
        userSocket.disconnect();
      };
    }
  }, [user?._id]);

  // Start/stop live geolocation watch when any parcel is In Transit
  useEffect(() => {
    const inTransit = parcels.filter(p => p.status === 'In Transit');
    if (inTransit.length === 0) {
      if (geoWatchIdRef.current != null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
      return;
    }
    if (!navigator.geolocation) return;
    const onSuccess = (pos) => {
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setAgentPosition([location.lat, location.lng]);
      // emit general live location
      socket?.emit('agent:location:update', { agentId: user._id, location, timestamp: new Date().toISOString() });
      // update all in-transit parcels so customers tracking parcel get parcel-specific updates
      inTransit.forEach(p => {
        apiFetch(`/parcels/${p._id}/location`, { method: 'POST', body: JSON.stringify(location) }).catch(() => {});
      });
    };
    const onError = () => {};
    try {
      geoWatchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
    } catch (_) {}
    return () => {
      if (geoWatchIdRef.current != null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    };
  }, [parcels, socket, user?._id]);

  // OTP flow handlers
  const requestDeliveryOtp = useCallback(async (parcelId) => {
    setOtpModal({ open: true, parcelId, step: 'request', code: '', sending: true, error: '' });
    try {
      await apiFetch(`/parcels/${parcelId}/request-delivery-otp`, { method: 'POST' });
      setOtpModal({ open: true, parcelId, step: 'confirm', code: '', sending: false, error: '' });
    } catch (e) {
      setOtpModal({ open: true, parcelId, step: 'request', code: '', sending: false, error: e?.message || 'Failed to send OTP' });
    }
  }, []);

  const confirmDeliveryOtp = useCallback(async () => {
    const { parcelId, code } = otpModal;
    if (!parcelId || !code) return;
    setOtpModal(m => ({ ...m, sending: true, error: '' }));
    try {
      const updated = await apiFetch(`/parcels/${parcelId}/confirm-delivery-otp`, { method: 'POST', body: JSON.stringify({ code }) });
      setParcels(list => list.map(x => x._id === updated._id ? updated : x));
      setOtpModal({ open: false, parcelId: null, step: 'request', code: '', sending: false, error: '' });
    } catch (e) {
      setOtpModal(m => ({ ...m, sending: false, error: e?.message || 'Invalid OTP' }));
    }
  }, [otpModal]);

  useEffect(() => {
    apiFetch('/parcels').then(setParcels).catch(()=>{});
  }, []);

  // Socket.IO connection and event listeners
  useEffect(() => {
    if (!socket) return;

    // Check socket connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    // Set initial connection status
    setIsConnected(socket.connected);
    
    // Listen for parcel updates from other sources
    const handleParcelUpdate = (updatedParcel) => {
      setParcels(list => list.map(x => x._id === updatedParcel.id ? { ...x, ...updatedParcel } : x));
    };
    
    socket.on('parcel:update', handleParcelUpdate);
    
    // Listen for location updates from other sources
    const handleLocationUpdate = (data) => {
      if (data.parcelId) {
        setParcels(list => list.map(x => 
          x._id === data.parcelId ? { ...x, currentLocation: data.location } : x
        ));
      }
    };
    
    socket.on('parcel:location', handleLocationUpdate);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('parcel:update', handleParcelUpdate);
      socket.off('parcel:location', handleLocationUpdate);
    };
  }, [socket]);

  return (
    <>
      <Navbar user={user} onLogout={logout} />
      <main className="container py-6 space-y-6">
        {/* Connection Status */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{t.agentDashboard}</h3>
              <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {isConnected ? t.connected : t.disconnected}
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Parcels */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t.assignedParcels}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="py-2 pr-4">{t.tracking}</th>
                  <th className="py-2 pr-4">{t.pickup}</th>
                  <th className="py-2 pr-4">{t.delivery}</th>
                  <th className="py-2 pr-4">{t.status}</th>
                  <th className="py-2 pr-4">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map((p) => (
                  <tr key={p._id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{p.trackingCode}</td>
                    <td className="py-2 pr-4">{p.pickupAddress}</td>
                    <td className="py-2 pr-4">{p.deliveryAddress}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        p.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                        p.status === 'In Transit' ? 'bg-blue-100 text-blue-800' :
                        p.status === 'Failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Link 
                        to={`/parcel/${p._id}`}
                        className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                      >
                        {t.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Map */}
        <LiveMap agentPosition={agentPosition} />
      </main>

      {otpModal.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow">
            <h4 className="text-base font-semibold mb-2">{t.confirmDelivery}</h4>
            {otpModal.step === 'request' ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{t.sendOtpMessage}</p>
                {otpModal.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{otpModal.error}</div>}
                <div className="flex justify-end gap-2">
                  <button className="rounded-md border px-3 py-1.5 text-sm" onClick={()=>setOtpModal({ open:false, parcelId:null, step:'request', code:'', sending:false, error:'' })}>{t.cancel}</button>
                  <button disabled={otpModal.sending} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={()=>requestDeliveryOtp(otpModal.parcelId)}>{t.sendOtp}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{t.enterOtpMessage}</p>
                <input maxLength={6} value={otpModal.code} onChange={e=>setOtpModal(m=>({ ...m, code: e.target.value }))} className="w-full rounded-md border px-3 py-2" placeholder={t.enterOtp} />
                {otpModal.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{otpModal.error}</div>}
                <div className="flex justify-end gap-2">
                  <button className="rounded-md border px-3 py-1.5 text-sm" onClick={()=>setOtpModal({ open:false, parcelId:null, step:'request', code:'', sending:false, error:'' })}>{t.cancel}</button>
                  <button disabled={otpModal.sending || !otpModal.code} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={confirmDeliveryOtp}>{t.confirm}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
