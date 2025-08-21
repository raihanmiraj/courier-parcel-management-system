import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { socket } from '../socket';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
	iconRetinaUrl: markerIcon2x,
	iconUrl: markerIcon,
	shadowUrl: markerShadow,
});

export default function ParcelRoute() {
  const { id } = useParams();
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const routingRef = useRef(null);
  const agentMarkerRef = useRef(null);
  const didFitRef = useRef(false);

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
    setLoading(true);
    api.get(`/parcels/${id}`).then(res => setParcel(res.data)).catch(() => setError('Failed to load parcel')).finally(() => setLoading(false));
  }, [id]);

  const geocode = useCallback(async (query) => {
    const { data } = await api.get('/geocode/search', { params: { q: query, limit: 1 } });
    if (!Array.isArray(data) || data.length === 0) throw new Error('Address not found');
    const { lat, lon } = data[0];
    return [parseFloat(lat), parseFloat(lon)];
  }, []);

  useEffect(() => {
    if (!parcel) return;
    let cancelled = false;
    (async () => {
      try {
        const start = await geocode(parcel.pickupAddress);
        const end = await geocode(parcel.deliveryAddress);
        const map = ensureMap(start, 12);
        if (!map || cancelled) return;

        if (!routingRef.current) {
          routingRef.current = L.Routing.control({
            waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            lineOptions: { styles: [{ color: '#2563eb', opacity: 0.85, weight: 6 }] },
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: false,
            show: false,
          }).addTo(map);

          routingRef.current.on('routesfound', (e) => {
            if (didFitRef.current) return;
            const route = e?.routes?.[0];
            if (route?.bounds) map.fitBounds(route.bounds, { padding: [30, 30] });
            didFitRef.current = true;
          });
        } else {
          routingRef.current.setWaypoints([L.latLng(start[0], start[1]), L.latLng(end[0], end[1])]);
        }

        // Optional: show current live location if available
        if (parcel.currentLocation?.lat && parcel.currentLocation?.lng) {
          const icon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
          if (!agentMarkerRef.current) {
            agentMarkerRef.current = L.marker([parcel.currentLocation.lat, parcel.currentLocation.lng], { icon }).addTo(map);
          } else {
            agentMarkerRef.current.setLatLng([parcel.currentLocation.lat, parcel.currentLocation.lng]);
          }
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [parcel, geocode, ensureMap]);

  // Live parcel location updates
  useEffect(() => {
    if (!parcel) return;
    socket.emit('subscribe:parcel', parcel._id);
    const handleLocation = (data) => {
      if (data.id !== parcel._id) return;
      const map = ensureMap();
      if (!map) return;
      const icon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
      if (!agentMarkerRef.current) {
        agentMarkerRef.current = L.marker([data.currentLocation.lat, data.currentLocation.lng], { icon }).addTo(map);
      } else {
        agentMarkerRef.current.setLatLng([data.currentLocation.lat, data.currentLocation.lng]);
      }
    };
    socket.on('parcel:location', handleLocation);
    return () => {
      socket.emit('unsubscribe:parcel', parcel._id);
      socket.off('parcel:location', handleLocation);
    };
  }, [parcel, ensureMap]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!parcel) return null;

  return (
    <div className="container py-6 space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Parcel Route</h3>
        <div className="grid gap-2 text-sm mt-2">
          <div><span className="text-gray-500">Tracking:</span> {parcel.trackingCode}</div>
          <div><span className="text-gray-500">From:</span> {parcel.pickupAddress}</div>
          <div><span className="text-gray-500">To:</span> {parcel.deliveryAddress}</div>
          <div><span className="text-gray-500">Status:</span> {parcel.status}</div>
          {parcel.agent && <div><span className="text-gray-500">Agent:</span> {parcel.agent.name}</div>}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div ref={mapElRef} className="h-[500px] w-full overflow-hidden rounded-lg" />
      </div>
    </div>
  );
}


