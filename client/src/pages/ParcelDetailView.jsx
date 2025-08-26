import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
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
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
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
    }).catch(() => setError(t.failedToLoadParcel)).finally(() => setLoading(false));
  }, [id, t.failedToLoadParcel]);

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
      setError(t.failedToUpdateStatus);
    } finally {
      setUpdatingStatus(false);
    }
  }, [status, parcel, t.failedToUpdateStatus]);

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
        setError(t.failedToSendLocation);
      } finally {
        setSendingLocation(false);
      }
    }, () => {
      setError(t.failedToGetCurrentLocation);
      setSendingLocation(false);
    });
  }, [parcel?._id, agentId, routeData, calculateDistance, t.failedToSendLocation, t.failedToGetCurrentLocation]);

  // Set up interval to send location every 20 seconds
  useEffect(() => {
    if (!parcel?._id) return;
    
    const intervalId = setInterval(() => {
      sendCurrentLocation();
    }, 20000); // 20 seconds = 20000 milliseconds
    
    // Clean up interval on component unmount or when parcel changes
    return () => clearInterval(intervalId);
  }, [parcel?._id, sendCurrentLocation]);

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
      setError(t.invalidLocationAddress);
    } finally {
      setSendingLocation(false);
    }
  }, [locationInput, parcel?._id, agentId, routeData, geocodeAddress, calculateDistance, t.invalidLocationAddress]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t.loadingParcelDetails}</p>
        </div>
      </div>
    );
  }

  if (error && !parcel) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">⚠️</div>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => navigate('/agent')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {t.backToAgent}
          </button>
        </div>
      </div>
    );
  }

  if (!parcel) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-[99999999999] shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/agent')}
                className="text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-md hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{t.parcelDetails}</h1>
                <p className="text-sm text-gray-600">{t.trackingCode} #{parcel.trackingCode}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {PARCEL_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button 
                onClick={updateStatus}
                disabled={updatingStatus || status === parcel.status}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? t.updating : t.updateStatus}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Parcel Information */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">{t.parcelInformation}</h2>
              </div>
              <div className="p-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.trackingCode}</label>
                    <p className="text-lg font-semibold text-gray-900">{parcel.trackingCode}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.status}</label>
                    <p className="text-lg font-semibold text-gray-900">{parcel.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.pickupAddress}</label>
                    <p className="text-sm text-gray-900">{parcel.pickupAddress}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.deliveryAddress}</label>
                    <p className="text-sm text-gray-900">{parcel.deliveryAddress}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.parcelSize}</label>
                    <p className="text-sm text-gray-900">{parcel.parcelSize}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.parcelType}</label>
                    <p className="text-sm text-gray-900">{parcel.parcelType}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.paymentType}</label>
                    <p className="text-sm text-gray-900">{parcel.paymentType}</p>
                  </div>
                  {parcel.paymentType === 'COD' && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">{t.codAmount}</label>
                      <p className="text-sm text-gray-900">BDT {parcel.codAmount}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.created}</label>
                    <p className="text-sm text-gray-900">{new Date(parcel.createdAt).toLocaleDateString()}</p>
                  </div>
                  {parcel.notes && (
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-500">{t.notes}</label>
                      <p className="text-sm text-gray-900">{parcel.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Route Map */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">{t.deliveryRoute}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {t.interactiveMapPickupDelivery}
                </p>
              </div>
              <div className="p-6">
                <div className="relative">
                  <div
                    ref={mapElRef}
                    className="h-96 w-full rounded-lg overflow-hidden border bg-gray-100"
                    style={{ minHeight: '384px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Agent Location */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t.agentLocation}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t.updateCurrentLocation}
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Current Location Button */}
                <button 
                  onClick={sendCurrentLocation}
                  disabled={sendingLocation}
                  className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {sendingLocation ? t.sending : '📍 ' + t.useMyCurrentLocation}
                </button>
                
                {/* Custom Location Input */}
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder={t.searchLocation}
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button 
                    onClick={sendCustomLocation}
                    disabled={sendingLocation || !locationInput.trim()}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    🔍 {t.sendCustomLocation}
                  </button>
                </div>
              </div>
            </div>

            {/* Delivery Metrics */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t.deliveryMetrics}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t.realTimeDeliveryCalculations}
                </p>
              </div>
              <div className="p-6 space-y-4">
                {distanceToPickup !== null && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="text-xs font-medium text-blue-600 uppercase tracking-wide">{t.distanceToPickup}</label>
                    <p className="text-2xl font-bold text-blue-900">{distanceToPickup.toFixed(1)} km</p>
                  </div>
                )}
                {etaToDelivery !== null && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <label className="text-xs font-medium text-green-600 uppercase tracking-wide">{t.etaToDelivery}</label>
                    <p className="text-2xl font-bold text-green-900">{etaToDelivery} minutes</p>
                  </div>
                )}
                <div className="grid gap-3 pt-2">
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.parcelSize}</label>
                    <p className="text-sm font-medium text-gray-900">{parcel.parcelSize}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">{t.parcelType}</label>
                    <p className="text-sm font-medium text-gray-900">{parcel.parcelType}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            {parcel.customer && (
              <div className="rounded-xl border bg-white shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{t.customerInformation}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.contactDetailsForRecipient}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">👤</span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{parcel.customer.name}</h4>
                    <p className="text-sm text-gray-600">{parcel.customer.email}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t.quickActions}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t.commonTasksAndShortcuts}
                </p>
              </div>
              <div className="p-6 space-y-3">
                <button
                  onClick={() => window.print()}
                  className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  🖨️ {t.printDetails}
                </button>
                <button
                  onClick={() => navigate('/agent')}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  🏠 {t.backToAgent}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
