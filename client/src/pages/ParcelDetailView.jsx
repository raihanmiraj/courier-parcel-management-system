import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { createSocket } from '../socket';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
	iconRetinaUrl: markerIcon2x,
	iconUrl: markerIcon,
	shadowUrl: markerShadow,
});

const PARCEL_STATUSES = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed"];

export default function ParcelDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const agentId = user?.id ?? user?._id;
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [sendingLocation, setSendingLocation] = useState(false);
  const [agentLocation, setAgentLocation] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [distanceToPickup, setDistanceToPickup] = useState(null);
  const [etaToDelivery, setEtaToDelivery] = useState(null);

  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const routingRef = useRef(null);
  const agentMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const deliveryMarkerRef = useRef(null);
  const socketRef = useRef(null);

  const ensureMap = useCallback((center = [23.78, 90.41], zoom = 12) => {
    if (!mapRef.current && mapElRef.current) {
      mapRef.current = L.map(mapElRef.current).setView(center, zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }
    return mapRef.current;
  }, []);

  const geocodeAddress = useCallback(async (query) => {
    try {
      const { data } = await api.get('/geocode/search', { params: { q: query, limit: 1 } });
      if (!Array.isArray(data) || data.length === 0) throw new Error('Address not found');
      const { lat, lon } = data[0];
      return [parseFloat(lat), parseFloat(lon)];
    } catch (err) {
      throw new Error('Failed to geocode address');
    }
  }, []);

  // Load parcel data
  useEffect(() => {
    setLoading(true);
    api.get(`/parcels/${id}`).then(res => {
      setParcel(res.data);
      setStatus(res.data.status);
    }).catch(() => setError('Failed to load parcel')).finally(() => setLoading(false));
  }, [id]);

  // Initialize socket
  useEffect(() => {
    if (agentId) {
      socketRef.current = createSocket(agentId);
      return () => {
        socketRef.current?.disconnect();
      };
    }
  }, [agentId]);

  // Create route and calculate distances
  useEffect(() => {
    if (!parcel) return;
    
    const createRoute = async () => {
      try {
        const pickup = await geocodeAddress(parcel.pickupAddress);
        const delivery = await geocodeAddress(parcel.deliveryAddress);
        setRouteData({ pickup, delivery });
        
        // Calculate distance from agent to pickup if agent location available
        if (agentLocation) {
          const distance = calculateDistance(agentLocation, pickup);
          setDistanceToPickup(distance);
        }
        
        // Calculate ETA to delivery
        const totalDistance = calculateDistance(pickup, delivery);
        const avgSpeed = 30; // km/h average delivery speed
        const etaHours = totalDistance / avgSpeed;
        setEtaToDelivery(Math.round(etaHours * 60)); // Convert to minutes
      } catch (err) {
        console.error('Route creation failed:', err);
      }
    };
    
    createRoute();
  }, [parcel, agentLocation, geocodeAddress]);

  // Initialize map and create route
  useEffect(() => {
    if (!routeData || !mapElRef.current) return;
    
    const map = ensureMap(routeData.pickup, 12);
    if (!map) return;

    // Add pickup and delivery markers
    const pickupIcon = L.divIcon({ html: '📍', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    const deliveryIcon = L.divIcon({ html: '🎯', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    
    if (!pickupMarkerRef.current) {
      pickupMarkerRef.current = L.marker(routeData.pickup, { icon: pickupIcon }).addTo(map);
    }
    if (!deliveryMarkerRef.current) {
      deliveryMarkerRef.current = L.marker(routeData.delivery, { icon: deliveryIcon }).addTo(map);
    }

    // Create routing
    if (!routingRef.current) {
      routingRef.current = L.Routing.control({
        waypoints: [L.latLng(routeData.pickup[0], routeData.pickup[1]), L.latLng(routeData.delivery[0], routeData.delivery[1])],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
      }).addTo(map);
    }
  }, [routeData, ensureMap]);

  // Update agent marker when location changes
  useEffect(() => {
    if (!agentLocation || !mapRef.current) return;
    const map = mapRef.current;

    const bikeIcon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    if (!agentMarkerRef.current) {
      agentMarkerRef.current = L.marker(agentLocation, { icon: bikeIcon }).addTo(map);
    } else {
      agentMarkerRef.current.setLatLng(agentLocation);
    }
  }, [agentLocation]);

  const calculateDistance = useCallback((point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2[0] - point1[0]) * Math.PI / 180;
    const dLon = (point2[1] - point1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1[0] * Math.PI / 180) * Math.cos(point2[0] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  const updateStatus = useCallback(async () => {
    if (!status || status === parcel?.status) return;
    setUpdatingStatus(true);
    try {
      const updated = await apiFetch(`/parcels/${parcel._id}/status`, { 
        method: 'POST', 
        body: JSON.stringify({ status }) 
      });
      setParcel(updated);
    } catch (err) {
      setError('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [status, parcel]);

  const sendCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation || !parcel?._id) return;
    setSendingLocation(true);
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setAgentLocation([location.lat, location.lng]);
      
      try {
        // Update parcel location
        await apiFetch(`/parcels/${parcel._id}/location`, { 
          method: 'POST', 
          body: JSON.stringify(location) 
        });
        
        // Emit socket event (guard if no agentId)
        if (agentId) {
          socketRef.current?.emit('agent:location:update', {
            agentId,
            location,
            timestamp: new Date().toISOString()
          });
        }
        
        // Recalculate distance to pickup
        if (routeData?.pickup) {
          const distance = calculateDistance([location.lat, location.lng], routeData.pickup);
          setDistanceToPickup(distance);
        }
      } catch (err) {
        setError('Failed to send location');
      } finally {
        setSendingLocation(false);
      }
    }, () => {
      setError('Failed to get current location');
      setSendingLocation(false);
    });
  }, [parcel?._id, agentId, routeData, calculateDistance]);

  const sendCustomLocation = useCallback(async () => {
    if (!locationInput.trim() || !parcel?._id) return;
    setSendingLocation(true);
    
    try {
      const coords = await geocodeAddress(locationInput.trim());
      setAgentLocation(coords);
      
      // Update parcel location
      await apiFetch(`/parcels/${parcel._id}/location`, { 
        method: 'POST', 
        body: JSON.stringify({ lat: coords[0], lng: coords[1] }) 
      });
      
      // Emit socket event (guard if no agentId)
      if (agentId) {
        socketRef.current?.emit('agent:location:update', {
          agentId,
          location: { lat: coords[0], lng: coords[1] },
          timestamp: new Date().toISOString()
        });
      }
      
      // Recalculate distance to pickup
      if (routeData?.pickup) {
        const distance = calculateDistance(coords, routeData.pickup);
        setDistanceToPickup(distance);
      }
      
      setLocationInput('');
    } catch (err) {
      setError('Invalid location address');
    } finally {
      setSendingLocation(false);
    }
  }, [locationInput, parcel?._id, agentId, routeData, geocodeAddress, calculateDistance]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error && !parcel) return <div className="p-6 text-red-600">{error}</div>;
  if (!parcel) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/agent')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-xl font-semibold">Parcel #{parcel.trackingCode}</h1>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border px-3 py-2"
              >
                {PARCEL_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button 
                onClick={updateStatus}
                disabled={updatingStatus || status === parcel.status}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {updatingStatus ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* Parcel Information */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {/* Basic Info */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Parcel Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-500">Tracking Code</label>
                  <p className="text-lg font-semibold">{parcel.trackingCode}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="text-lg font-semibold">{parcel.status}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Pickup Address</label>
                  <p className="text-sm">{parcel.pickupAddress}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Delivery Address</label>
                  <p className="text-sm">{parcel.deliveryAddress}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Type</label>
                  <p className="text-sm">{parcel.paymentType}</p>
                </div>
                {parcel.paymentType === 'COD' && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">COD Amount</label>
                    <p className="text-sm">${parcel.codAmount}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Route Map */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Delivery Route</h3>
              <div ref={mapElRef} className="h-96 w-full overflow-hidden rounded-lg" />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Agent Location */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Agent Location</h3>
              
              {/* Current Location Button */}
              <button 
                onClick={sendCurrentLocation}
                disabled={sendingLocation}
                className="w-full rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50 mb-3"
              >
                {sendingLocation ? 'Sending...' : 'Use My Current Location'}
              </button>
              
              {/* Custom Location Input */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search location (e.g., Times Square)"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
                <button 
                  onClick={sendCustomLocation}
                  disabled={sendingLocation || !locationInput.trim()}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Send Custom Location
                </button>
              </div>
            </div>

            {/* Delivery Metrics */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Delivery Metrics</h3>
              <div className="space-y-3">
                {distanceToPickup !== null && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Distance to Pickup</label>
                    <p className="text-lg font-semibold">{distanceToPickup.toFixed(1)} km</p>
                  </div>
                )}
                {etaToDelivery !== null && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">ETA to Delivery</label>
                    <p className="text-lg font-semibold">{etaToDelivery} minutes</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-500">Parcel Size</label>
                  <p className="text-sm">{parcel.parcelSize}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Parcel Type</label>
                  <p className="text-sm">{parcel.parcelType}</p>
                </div>
                {parcel.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Notes</label>
                    <p className="text-sm">{parcel.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Info */}
            {parcel.customer && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Customer Information</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Name</label>
                    <p className="text-sm">{parcel.customer.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Email</label>
                    <p className="text-sm">{parcel.customer.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
