import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { createSocket } from '../socket';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix default marker icons in bundlers like Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function AgentParcelDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState('');

  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const routingRef = useRef(null);
  const agentMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const deliveryMarkerRef = useRef(null);
  const socketRef = useRef(null);

  // Calculate distance between two points using Haversine formula
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

  // Load parcel data
  useEffect(() => {
    setLoading(true);
    api.get(`/parcels/${id}`)
      .then(res => {
        setParcel(res.data);
        setStatus(res.data.status);
        if (res.data.currentLocation) {
          const locationData = res.data.currentLocation;
          setAgentLocation({
            lat: locationData.lat,
            lng: locationData.lng,
            updatedAt: locationData.updatedAt || new Date().toISOString()
          });
        }
      })
      .catch(() => setError(t.failedToLoadParcel))
      .finally(() => setLoading(false));
  }, [id, t.failedToLoadParcel]);

  // Initialize socket for real-time tracking
  useEffect(() => {
    if (!parcel?._id || !parcel?.agent?._id) return;
    
    const socketUserId = `admin:${user?._id}:${Date.now()}`;
    const s = createSocket(socketUserId);
    socketRef.current = s;

    const handleAgentLocationUpdate = (data) => {
      if (data.agentId === parcel.agent._id) {
        const newLocation = {
          lat: data.location.lat,
          lng: data.location.lng,
          updatedAt: data.timestamp
        };
        setAgentLocation(newLocation);
      }
    };

    s.on('agent:location:update', handleAgentLocationUpdate);

    return () => {
      s.off('agent:location:update', handleAgentLocationUpdate);
      s.disconnect();
    };
  }, [parcel?._id, parcel?.agent?._id, user?._id]);

  // Update parcel status
  const updateStatus = useCallback(async () => {
    if (!status || status === parcel?.status) return;
    setUpdatingStatus(true);
    try {
      await api.post(`/parcels/${parcel._id}/status`, { status });
      setParcel(prev => ({ ...prev, status }));
    } catch (err) {
      setError('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [status, parcel?._id, parcel?.status]);

  // Geocode addresses
  const geocodeAddress = useCallback(async (query) => {
    try {
      const { data } = await api.get('/geocode/search', {
        params: { q: query, limit: 1 }
      });
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Address not found');
      }
      const { lat, lon } = data[0];
      return [parseFloat(lat), parseFloat(lon)];
    } catch (err) {
      throw new Error('Failed to geocode address');
    }
  }, []);

  // Initialize map with proper error handling
  const initializeMap = useCallback(() => {
    if (!mapElRef.current || mapRef.current) return;

    try {
      const defaultCenter = [23.78, 90.41]; // Default to Dhaka, Bangladesh
      const map = L.map(mapElRef.current).setView(defaultCenter, 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
      setMapInitialized(true);
      setMapError('');
    } catch (err) {
      console.error('Map initialization failed:', err);
      setMapError('Failed to initialize map');
    }
  }, []);

  // Initialize map when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);

    return () => clearTimeout(timer);
  }, [initializeMap]);

  // Create route when parcel data is available
  useEffect(() => {
    if (!parcel) return;

    const createRoute = async () => {
      try {
        const pickup = await geocodeAddress(parcel.pickupAddress);
        const delivery = await geocodeAddress(parcel.deliveryAddress);
        setRouteData({ pickup, delivery });
      } catch (err) {
        console.error('Route creation failed:', err);
        setError('Failed to create route: ' + err.message);
      }
    };

    createRoute();
  }, [parcel, geocodeAddress]);

  // Create route on map
  useEffect(() => {
    if (!routeData || !mapRef.current || !mapInitialized) return;

    const map = mapRef.current;
    const { pickup, delivery } = routeData;

    try {
      // Clean up existing routing control
      if (routingRef.current) {
        map.removeControl(routingRef.current);
        routingRef.current = null;
      }

      // Clean up existing markers
      if (pickupMarkerRef.current) {
        map.removeLayer(pickupMarkerRef.current);
        pickupMarkerRef.current = null;
      }
      if (deliveryMarkerRef.current) {
        map.removeLayer(deliveryMarkerRef.current);
        deliveryMarkerRef.current = null;
      }

      // Create custom markers
      const pickupIcon = L.divIcon({
        html: '📍',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const deliveryIcon = L.divIcon({
        html: '🎯',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      // Add markers to map
      pickupMarkerRef.current = L.marker(pickup, { icon: pickupIcon }).addTo(map);
      deliveryMarkerRef.current = L.marker(delivery, { icon: deliveryIcon }).addTo(map);

      // Create routing control
      routingRef.current = L.Routing.control({
        waypoints: [
          L.latLng(pickup[0], pickup[1]),
          L.latLng(delivery[0], delivery[1])
        ],
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1'
        }),
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        lineOptions: { 
          styles: [{ color: '#2563eb', opacity: 0.8, weight: 4 }] 
        }
      }).addTo(map);

      // Fit map to show both points
      const bounds = L.latLngBounds([pickup, delivery]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } catch (err) {
      console.error('Error creating route on map:', err);
      setMapError('Failed to display route on map');
    }
  }, [routeData, mapInitialized]);

  // Update agent marker
  useEffect(() => {
    if (!agentLocation?.lat || !agentLocation?.lng || !mapRef.current || !mapInitialized) return;

    const map = mapRef.current;
    const location = [agentLocation.lat, agentLocation.lng];

    try {
      const bikeIcon = L.divIcon({
        html: '🏍️',
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      if (!agentMarkerRef.current) {
        agentMarkerRef.current = L.marker(location, { icon: bikeIcon }).addTo(map);
        if (parcel?.agent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${parcel.agent.name}</div>
              <div class="text-sm text-gray-600">Delivery Agent</div>
              <div class="text-xs text-gray-500">Last updated: ${new Date(agentLocation.updatedAt).toLocaleTimeString()}</div>
            </div>
          `);
        }
      } else {
        agentMarkerRef.current.setLatLng(location);
      }

      // Pan to agent location if not visible
      const bounds = map.getBounds();
      if (!bounds.contains(location)) {
        map.panTo(location, { animate: true });
      }
    } catch (err) {
      console.error('Error updating agent marker:', err);
    }
  }, [agentLocation, parcel?.agent, mapInitialized]);

  // Cleanup function
  useEffect(() => {
    return () => {
      try {
        if (routingRef.current && mapRef.current) {
          mapRef.current.removeControl(routingRef.current);
        }
        if (agentMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(agentMarkerRef.current);
        }
        if (pickupMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(pickupMarkerRef.current);
        }
        if (deliveryMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(deliveryMarkerRef.current);
        }
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      } catch (err) {
        console.error('Error during cleanup:', err);
      }
    };
  }, []);

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
            onClick={() => navigate('/admin')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
      <header className="bg-white border-b sticky top-0 z-[9999999] shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t.parcelDetails}</h1>
                <p className="text-gray-600">{t.trackingCode} #{parcel.trackingCode}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Pending">Pending</option>
                <option value="Assigned">Assigned</option>
                <option value="Picked Up">Picked Up</option>
                <option value="In Transit">In Transit</option>
                <option value="Delivered">Delivered</option>
                <option value="Failed">Failed</option>
              </select>
              <button 
                onClick={updateStatus}
                disabled={updatingStatus || status === parcel.status}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? t.updating : t.updateStatus}
              </button>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${parcel.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                parcel.status === 'In Transit' ? 'bg-blue-100 text-blue-800' :
                  parcel.status === 'Failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                }`}>
                {parcel.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
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

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Parcel Information */}
            <div className="bg-white rounded-xl border shadow-sm">
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
                      <p className="text-sm text-gray-900">${parcel.codAmount}</p>
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

            {/* Delivery Route Map */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">{t.deliveryRoute}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {t.realTimeTracking}
                </p>
              </div>
              <div className="p-6">
                <div className="relative">
                  <div
                    ref={mapElRef}
                    className="h-96 w-full rounded-lg overflow-hidden border bg-gray-100"
                    style={{ minHeight: '384px' }}
                  />
                  {!mapInitialized && !mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">{t.loadingMap}</p>
                      </div>
                    </div>
                  )}
                  {mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                      <div className="text-center text-red-600">
                        <div className="text-2xl mb-2">⚠️</div>
                        <p className="text-sm">{mapError}</p>
                      </div>
                    </div>
                  )}
                </div>
                {agentLocation && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-blue-800">{t.liveTrackingActive}</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      {t.agentLocationUpdated}: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Assigned Agent Information */}
            {parcel.agent && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{t.assignedAgent}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.deliveryAgentDetails}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">🚚</span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{parcel.agent.name}</h4>
                    <p className="text-sm text-gray-600">{parcel.agent.email}</p>
                    {parcel.agent.phone && (
                      <p className="text-sm text-gray-600">{parcel.agent.phone}</p>
                    )}
                    {agentLocation && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium text-green-800">{t.online}</span>
                        </div>
                        <p className="text-xs text-green-600 mt-1">
                          {t.lastLocation}: {agentLocation.lat.toFixed(6)}, {agentLocation.lng.toFixed(6)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Customer Information */}
            {parcel.customer && (
              <div className="bg-white rounded-xl border shadow-sm">
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
                    {parcel.customer.phone && (
                      <p className="text-sm text-gray-600">{parcel.customer.phone}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t.quickActions}</h3>
              </div>
              <div className="p-6 space-y-3">
                <button
                  onClick={() => window.print()}
                  className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  🖨️ {t.printDetails}
                </button>
                <button
                  onClick={() => navigate('/admin')}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
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
