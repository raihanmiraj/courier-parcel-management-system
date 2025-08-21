import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { createSocket } from '../socket';
import { GoogleMap, DirectionsRenderer, Marker, useJsApiLoader } from '@react-google-maps/api';

const STATUS_STEPS = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed"];

export default function TrackParcel() {
  const { id } = useParams();
  const [parcel, setParcel] = useState(null);
  const [liveLoc, setLiveLoc] = useState(null);
  const [directions, setDirections] = useState(null);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);

  const tokenUserId = useMemo(() => {
    try { return JSON.parse(atob((localStorage.getItem('token')||'.').split('.')[1])).id; } catch { return undefined; }
  }, []);

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });
  const socketRef = useRef(null);

  useEffect(() => {
    apiFetch(`/parcels/${id}`).then(setParcel).catch(()=>{});
  }, [id]);

  useEffect(() => {
    socketRef.current = createSocket(tokenUserId);
    socketRef.current.emit('subscribe:parcel', id);
    socketRef.current.on('parcel:location', (payload) => {
      if (payload.id === id) setLiveLoc(payload.currentLocation);
    });
    socketRef.current.on('parcel:update', (payload) => {
      if (payload.id === id) setParcel(prev => prev ? { ...prev, status: payload.status, agent: payload.agent ?? prev.agent } : prev);
    });
    return () => {
      socketRef.current.emit('unsubscribe:parcel', id);
      socketRef.current.disconnect();
    };
  }, [id, tokenUserId]);

  useEffect(() => {
    if (!isLoaded || !window.google || !parcel) return;
    const svc = new window.google.maps.DirectionsService();
    const origin = parcel.pickupAddress;
    const destination = parcel.deliveryAddress;

    if (liveLoc?.lat && liveLoc?.lng) {
      // live origin is agent
      svc.route({
        origin: { lat: liveLoc.lat, lng: liveLoc.lng },
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (res, status) => {
        if (status === 'OK') {
          setDirections(res);
          const leg = res.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        }
      });
    } else {
      svc.route({ origin, destination, travelMode: window.google.maps.TravelMode.DRIVING }, (res, status) => {
        if (status === 'OK') {
          setDirections(res);
          const leg = res.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        }
      });
    }
  }, [isLoaded, parcel, liveLoc]);

  if (!parcel) return null;

  const currentIdx = STATUS_STEPS.indexOf(parcel.status);

  return (
    <div className="container py-6 space-y-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tracking #{parcel.trackingCode}</h3>
          <div className="text-sm text-gray-600">Status: <span className="rounded-full bg-gray-100 px-2 py-0.5">{parcel.status}</span></div>
        </div>
        <ol className="flex items-center gap-4 overflow-x-auto">
          {STATUS_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${i<=currentIdx ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{i+1}</div>
              <span className={`text-sm ${i<=currentIdx ? 'font-medium' : 'text-gray-500'}`}>{s}</span>
              {i<STATUS_STEPS.length-1 && <div className={`mx-2 h-px w-10 ${i<currentIdx ? 'bg-brand-600' : 'bg-gray-300'}`}></div>}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="h-[500px] w-full overflow-hidden rounded-lg">
            {isLoaded && (
              <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{ lat: liveLoc?.lat || 23.78, lng: liveLoc?.lng || 90.41 }} zoom={11}>
                {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: false }} />}
                {liveLoc && <Marker position={{ lat: liveLoc.lat, lng: liveLoc.lng }} title="Courier Location" />}
              </GoogleMap>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h4 className="mb-2 text-base font-semibold">Trip Details</h4>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-500">From:</span> {parcel.pickupAddress}</div>
            <div><span className="text-gray-500">To:</span> {parcel.deliveryAddress}</div>
            <div><span className="text-gray-500">Distance:</span> {distance ?? '—'}</div>
            <div><span className="text-gray-500">ETA:</span> {parcel.etaMinutes ? `${parcel.etaMinutes} min` : (duration ?? '—')}</div>
            <div><span className="text-gray-500">Payment:</span> {parcel.paymentType}{parcel.paymentType==='COD' ? ` ($${parcel.codAmount})` : ''}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
