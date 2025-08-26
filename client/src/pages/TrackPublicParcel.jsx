import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

export default function TrackPublicParcel() {
  const { user, logout } = useAuth();
  const [trackingCode, setTrackingCode] = useState('');
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const routingRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const deliveryMarkerRef = useRef(null);
  const agentMarkerRef = useRef(null);

  const hasLiveLocation = Boolean(parcel?.currentLocation?.lat && parcel?.currentLocation?.lng);

  const geocodeAddress = useCallback(async (query) => {
    const { data } = await api.get('/geocode/search', { params: { q: query, limit: 1 } });
    if (!Array.isArray(data) || data.length === 0) throw new Error('Address not found');
    const { lat, lon } = data[0];
    return [parseFloat(lat), parseFloat(lon)];
  }, []);

  const ensureMap = useCallback((center = [23.78, 90.41], zoom = 11) => {
    if (!mapRef.current && mapElRef.current) {
      mapRef.current = L.map(mapElRef.current).setView(center, zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }
    return mapRef.current;
  }, []);

  const clearRouteAndMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try { routingRef.current && map.removeControl(routingRef.current); } catch (_) {}
    routingRef.current = null;
    try { pickupMarkerRef.current && map.removeLayer(pickupMarkerRef.current); } catch (_) {}
    try { deliveryMarkerRef.current && map.removeLayer(deliveryMarkerRef.current); } catch (_) {}
    try { agentMarkerRef.current && map.removeLayer(agentMarkerRef.current); } catch (_) {}
    pickupMarkerRef.current = null;
    deliveryMarkerRef.current = null;
    agentMarkerRef.current = null;
  }, []);

  const buildRoute = useCallback(async (p) => {
    if (!p) return;
    const map = ensureMap();
    if (!map) return;
    clearRouteAndMarkers();
    const pickup = await geocodeAddress(p.pickupAddress);
    const delivery = await geocodeAddress(p.deliveryAddress);

    const pickupIcon = L.divIcon({ html: '📍', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    const deliveryIcon = L.divIcon({ html: '🎯', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    pickupMarkerRef.current = L.marker(pickup, { icon: pickupIcon }).addTo(map);
    deliveryMarkerRef.current = L.marker(delivery, { icon: deliveryIcon }).addTo(map);

    routingRef.current = L.Routing.control({
      waypoints: [L.latLng(pickup[0], pickup[1]), L.latLng(delivery[0], delivery[1])],
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
    }).addTo(map);

    const bounds = L.latLngBounds([pickup, delivery]);
    map.fitBounds(bounds, { padding: [40, 40] });

    if (p.currentLocation?.lat && p.currentLocation?.lng) {
      const bikeIcon = L.divIcon({ html: '🏍️', className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      agentMarkerRef.current = L.marker([p.currentLocation.lat, p.currentLocation.lng], { icon: bikeIcon }).addTo(map);
    }
  }, [ensureMap, clearRouteAndMarkers, geocodeAddress]);

  const onTrack = async (e) => {
    e.preventDefault();
    const code = trackingCode.trim();
    if (!code) return;
    setLoading(true);
    setError('');
    setParcel(null);
    try {
      const res = await api.get(`/parcels/track/${code}`);
      const data = res.data;
      if (data?.message) {
        setError(data.message);
      } else {
        setParcel(data);
      }
    } catch (_) {
      setError('Failed to load parcel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!parcel) return;
    buildRoute(parcel).catch(() => {});
  }, [parcel, buildRoute]);

  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        try { routingRef.current && map.removeControl(routingRef.current); } catch (_) {}
        try { pickupMarkerRef.current && map.removeLayer(pickupMarkerRef.current); } catch (_) {}
        try { deliveryMarkerRef.current && map.removeLayer(deliveryMarkerRef.current); } catch (_) {}
        try { agentMarkerRef.current && map.removeLayer(agentMarkerRef.current); } catch (_) {}
        try { map.remove(); } catch (_) {}
      }
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-[50] bg-white/80 backdrop-blur border-b">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">C</div>
            <span className="font-semibold">Courier Manager</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-gray-600">{user.name} <span className="text-gray-400">• {user.role}</span></span>
                <button onClick={logout} className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">Logout</button>
              </>
            ) : (
              <Link to="/login" className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-4">Track your parcel</h1>
          <form onSubmit={onTrack} className="flex flex-col sm:flex-row gap-3">
            <input
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              placeholder="Enter tracking code (e.g., ABC123)"
              className="flex-1 rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <button disabled={loading} className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{loading ? 'Tracking…' : 'Track'}</button>
          </form>
          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        {parcel && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
              <div className="h-[460px] w-full overflow-hidden rounded-lg">
                <div ref={mapElRef} className="h-full w-full bg-gray-100" />
              </div>
              {hasLiveLocation && (
                <div className="mt-3 p-3 rounded-lg border bg-green-50 text-sm text-green-800">🟢 Live tracking active</div>
              )}
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-2 text-base font-semibold">Tracking #{parcel.trackingCode}</div>
              <div className="space-y-1 text-sm">
                <div><span className="text-gray-500">Status:</span> {parcel.status}</div>
                <div><span className="text-gray-500">Pickup:</span> {parcel.pickupAddress}</div>
                <div><span className="text-gray-500">Delivery:</span> {parcel.deliveryAddress}</div>
                <div><span className="text-gray-500">Payment:</span> {parcel.paymentType}{parcel.paymentType==='COD' ? ` (BDT ${parcel.codAmount})` : ''}</div>
                {parcel.agent && <div><span className="text-gray-500">Agent:</span> {parcel.agent.name}</div>}
                {parcel.currentLocation && (
                  <div><span className="text-gray-500">Last Update:</span> {new Date(parcel.currentLocation.updatedAt).toLocaleString()}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


