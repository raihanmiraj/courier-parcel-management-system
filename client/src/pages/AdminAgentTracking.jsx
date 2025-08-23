import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

// Check if routing plugin is loaded
console.log('Leaflet version:', L.version);
console.log('Leaflet Routing plugin available:', typeof L.Routing !== 'undefined');
console.log('L.Routing object:', L.Routing);

export default function AdminAgentTracking() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agentLocation, setAgentLocation] = useState(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState('');
  const [agentSpeed, setAgentSpeed] = useState(null);
  const [previousAgentLocation, setPreviousAgentLocation] = useState(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState(null);
  const [agentParcels, setAgentParcels] = useState([]);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [routeData, setRouteData] = useState(null);

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

  // Calculate agent speed based on location changes
  const calculateAgentSpeed = useCallback((currentLoc, previousLoc, timeDiff) => {
    if (!previousLoc || !currentLoc || timeDiff <= 0) return null;
    
    const distance = calculateDistance(
      [previousLoc.lat, previousLoc.lng],
      [currentLoc.lat, currentLoc.lng]
    );
    
    const timeInHours = timeDiff / (1000 * 60 * 60);
    const speed = distance / timeInHours;
    
    return speed > 0 && speed <= 120 ? speed : null;
  }, [calculateDistance]);

  // Load agents
  useEffect(() => {
    setLoading(true);
    api.get('/users?role=agent')
      .then(res => {
        setAgents(res.data);
        if (res.data.length > 0) {
          setSelectedAgent(res.data[0]);
        }
      })
      .catch(() => setError('Failed to load agents'))
      .finally(() => setLoading(false));
  }, []);

  // Load agent parcels when agent changes
  useEffect(() => {
    if (!selectedAgent) return;
    
    api.get(`/parcels?agent=${selectedAgent._id}`)
      .then(res => {
        setAgentParcels(res.data);
        if (res.data.length > 0) {
          setSelectedParcel(res.data[0]);
        }
      })
      .catch(() => setError('Failed to load agent parcels'));
  }, [selectedAgent]);

  // Initialize socket for real-time tracking
  useEffect(() => {
    if (!selectedAgent) return;
    
    const socketUserId = `admin:${user?._id}:${Date.now()}`;
    const s = createSocket(socketUserId);
    socketRef.current = s;

    const handleAgentLocationUpdate = (data) => {
      if (data.agentId === selectedAgent._id) {
        const newLocation = {
          lat: data.location.lat,
          lng: data.location.lng,
          updatedAt: data.timestamp
        };
        
        // Calculate speed if we have previous location
        if (agentLocation && lastLocationUpdate) {
          const timeDiff = new Date(data.timestamp).getTime() - lastLocationUpdate.getTime();
          const speed = calculateAgentSpeed(newLocation, agentLocation, timeDiff);
          if (speed !== null) {
            setAgentSpeed(speed);
          }
        }
        
        setPreviousAgentLocation(agentLocation);
        setAgentLocation(newLocation);
        setLastLocationUpdate(new Date(data.timestamp));
      }
    };

    s.on('agent:location:update', handleAgentLocationUpdate);

    return () => {
      s.off('agent:location:update', handleAgentLocationUpdate);
      s.disconnect();
    };
  }, [selectedAgent, user?._id, agentLocation, lastLocationUpdate, calculateAgentSpeed]);

  // Geocode addresses
  const geocodeAddress = useCallback(async (query) => {
    try {
      console.log('Geocoding address:', query);
      const { data } = await api.get('/geocode/search', {
        params: { q: query, limit: 1 }
      });
      
      console.log('Geocoding response:', data);
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Address not found');
      }
      
      const { lat, lon } = data[0];
      const coordinates = [parseFloat(lat), parseFloat(lon)];
      
      console.log('Geocoded coordinates:', coordinates);
      return coordinates;
    } catch (err) {
      console.error('Geocoding failed for:', query, err);
      throw new Error(`Failed to geocode address "${query}": ${err.message}`);
    }
  }, []);

  // Create route when parcel changes
  useEffect(() => {
    if (!selectedParcel) return;

    const createRoute = async () => {
      try {
        console.log('Creating route for parcel:', selectedParcel.trackingCode);
        const pickup = await geocodeAddress(selectedParcel.pickupAddress);
        const delivery = await geocodeAddress(selectedParcel.deliveryAddress);
        console.log('Route coordinates:', { pickup, delivery });
        setRouteData({ pickup, delivery });
      } catch (err) {
        console.error('Route creation failed:', err);
        setMapError('Failed to create route: ' + err.message);
      }
    };

    createRoute();
  }, [selectedParcel, geocodeAddress]);

  // Initialize map with proper error handling
  const initializeMap = useCallback(() => {
    if (!mapElRef.current || mapRef.current) return;

    try {
      console.log('Initializing map...');
      const defaultCenter = [23.78, 90.41]; // Default to Dhaka, Bangladesh
      const map = L.map(mapElRef.current).setView(defaultCenter, 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
      setMapInitialized(true);
      setMapError('');
      console.log('Map initialized successfully');
    } catch (err) {
      console.error('Map initialization failed:', err);
      setMapError('Failed to initialize map');
    }
  }, []);

  // Initialize map when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapElRef.current) {
        console.log('Map container ready, initializing...');
        console.log('Map container dimensions:', {
          width: mapElRef.current.offsetWidth,
          height: mapElRef.current.offsetHeight,
          visible: mapElRef.current.offsetParent !== null
        });
        initializeMap();
      } else {
        console.log('Map container not ready yet');
      }
    }, 200); // Increased timeout for better DOM readiness

    return () => clearTimeout(timer);
  }, [initializeMap]);

  // Monitor map container element
  useEffect(() => {
    const checkContainer = () => {
      if (mapElRef.current) {
        console.log('Map container found:', {
          element: mapElRef.current,
          tagName: mapElRef.current.tagName,
          className: mapElRef.current.className,
          dimensions: {
            width: mapElRef.current.offsetWidth,
            height: mapElRef.current.offsetHeight
          }
        });
      } else {
        console.log('Map container not found yet');
      }
    };

    // Check immediately
    checkContainer();
    
    // Check again after a short delay
    const timer = setTimeout(checkContainer, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Initialize map when no parcel is selected (show default view)
  useEffect(() => {
    if (!selectedParcel && mapRef.current && mapInitialized) {
      console.log('No parcel selected, showing default map view');
      const map = mapRef.current;
      
      // Set a default view
      map.setView([23.78, 90.41], 10);
      
      // Clear any existing routes or markers
      if (routingRef.current) {
        map.removeControl(routingRef.current);
        routingRef.current = null;
      }
      if (pickupMarkerRef.current) {
        map.removeLayer(pickupMarkerRef.current);
        pickupMarkerRef.current = null;
      }
      if (deliveryMarkerRef.current) {
        map.removeLayer(deliveryMarkerRef.current);
        deliveryMarkerRef.current = null;
      }
    }
  }, [selectedParcel, mapInitialized]);

  // Create route on map
  useEffect(() => {
    if (!routeData || !mapRef.current || !mapInitialized) {
      console.log('Route creation skipped:', { 
        hasRouteData: !!routeData, 
        hasMap: !!mapRef.current, 
        mapInitialized 
      });
      return;
    }

    const map = mapRef.current;
    const { pickup, delivery } = routeData;

    try {
      console.log('Creating route on map:', { pickup, delivery });
      
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
      try {
        // Check if routing plugin is available
        if (typeof L.Routing === 'undefined') {
          throw new Error('Routing plugin not loaded');
        }
        
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
        
        console.log('Routing control created successfully');
      } catch (routingErr) {
        console.error('Routing control creation failed:', routingErr);
        // Fallback: create a simple polyline instead of routing control
        try {
          const polyline = L.polyline([pickup, delivery], {
            color: '#2563eb',
            weight: 4,
            opacity: 0.8
          }).addTo(map);
          
          // Store reference for cleanup
          routingRef.current = { 
            remove: () => map.removeLayer(polyline),
            _isPolyline: true 
          };
          
          console.log('Fallback polyline created instead of routing control');
        } catch (polylineErr) {
          console.error('Fallback polyline creation also failed:', polylineErr);
          setMapError('Failed to create route visualization');
        }
      }

      // Fit map to show both points
      const bounds = L.latLngBounds([pickup, delivery]);
      map.fitBounds(bounds, { padding: [50, 50] });
      
      console.log('Route created successfully on map');
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
        if (selectedAgent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${selectedAgent.name}</div>
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
  }, [agentLocation, selectedAgent, mapInitialized]);

  // Cleanup function
  useEffect(() => {
    return () => {
      try {
        if (routingRef.current && mapRef.current) {
          if (routingRef.current._isPolyline) {
            // Handle fallback polyline cleanup
            routingRef.current.remove();
          } else {
            // Handle normal routing control cleanup
            mapRef.current.removeControl(routingRef.current);
          }
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
          <p className="text-gray-600">Loading agents...</p>
        </div>
      </div>
    );
  }

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
                <h1 className="text-2xl font-bold text-gray-900">{t.agentTracking}</h1>
                <p className="text-gray-600">{t.realTimeTrackingOfDeliveryAgents}</p>
              </div>
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

        <div className="grid gap-8 lg:grid-cols-4">
          {/* Agent Selection Sidebar */}
          <div className="space-y-6">
            {/* Agent Selection */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t.selectAgent}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t.chooseAgentToTrack}
                </p>
              </div>
              <div className="p-6">
                <select 
                  value={selectedAgent?._id || ''} 
                  onChange={(e) => {
                    const agent = agents.find(a => a._id === e.target.value);
                    setSelectedAgent(agent);
                    setAgentLocation(null);
                    setAgentSpeed(null);
                  }}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {agents.map(agent => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name} ({agent.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agent Information */}
            {selectedAgent && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{t.agentInfo}</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">🚚</span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{selectedAgent.name}</h4>
                    <p className="text-sm text-gray-600">{selectedAgent.email}</p>
                    {agentLocation && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium text-green-800">{t.online}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Agent Metrics */}
            {selectedAgent && agentLocation && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{t.liveMetrics}</h3>
                </div>
                <div className="p-6 space-y-4">
                  {agentSpeed !== null && (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <label className="text-xs font-medium text-orange-600 uppercase tracking-wide">{t.currentSpeed}</label>
                      <p className="text-2xl font-bold text-orange-900">{agentSpeed.toFixed(1)} km/h</p>
                    </div>
                  )}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="text-xs font-medium text-blue-600 uppercase tracking-wide">{t.lastUpdate}</label>
                    <p className="text-sm font-bold text-blue-900">
                      {agentLocation.updatedAt ? new Date(agentLocation.updatedAt).toLocaleTimeString() : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <label className="text-xs font-medium text-green-600 uppercase tracking-wide">{t.coordinates}</label>
                    <p className="text-xs font-bold text-green-900">
                      {agentLocation.lat.toFixed(6)}, {agentLocation.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Parcel Selection */}
            {selectedAgent && agentParcels.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">{t.activeParcels}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.selectParcelToViewRoute}
                  </p>
                </div>
                <div className="p-6">
                  <select 
                    value={selectedParcel?._id || ''} 
                    onChange={(e) => {
                      const parcel = agentParcels.find(p => p._id === e.target.value);
                      setSelectedParcel(parcel);
                    }}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {agentParcels.map(parcel => (
                      <option key={parcel._id} value={parcel._id}>
                        {parcel.trackingCode} - {parcel.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Map and Tracking View */}
          <div className="lg:col-span-3 space-y-6">
            {/* Live Tracking Map */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">{t.liveTrackingMap}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedAgent ? `${t.tracking} ${selectedAgent.name}` : t.selectAnAgentToStartTracking}
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
                        <p className="text-sm text-gray-600">Loading map...</p>
                      </div>
                    </div>
                  )}
                  {mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                      <div className="text-center text-red-600">
                        <div className="text-2xl mb-2">⚠️</div>
                        <p className="text-sm">{mapError}</p>
                        <button 
                          onClick={() => {
                            setMapError('');
                            initializeMap();
                          }}
                          className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}
                  {mapInitialized && !routeData && !mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg bg-opacity-75">
                      <div className="text-center text-gray-600">
                        <div className="text-2xl mb-2">🗺️</div>
                        <p className="text-sm">Select a parcel to view route</p>
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
                {mapInitialized && routeData && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-green-800">Route displayed</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      Showing route from pickup to delivery location
                    </p>
                  </div>
                )}
                
                {/* Debug Information */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-gray-700">Debug Info</summary>
                      <div className="mt-2 space-y-1 text-gray-600">
                        <div>Map Initialized: {mapInitialized ? '✅' : '❌'}</div>
                        <div>Map Element: {mapElRef.current ? '✅' : '❌'}</div>
                        <div>Map Instance: {mapRef.current ? '✅' : '❌'}</div>
                        <div>Route Data: {routeData ? '✅' : '❌'}</div>
                        <div>Selected Parcel: {selectedParcel ? selectedParcel.trackingCode : 'None'}</div>
                        <div>Agent Location: {agentLocation ? '✅' : '❌'}</div>
                        {routeData && (
                          <div>
                            Pickup: [{routeData.pickup?.[0]?.toFixed(6)}, {routeData.pickup?.[1]?.toFixed(6)}]
                          </div>
                        )}
                        {routeData && (
                          <div>
                            Delivery: [{routeData.delivery?.[0]?.toFixed(6)}, {routeData.delivery?.[1]?.toFixed(6)}]
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <button 
                            onClick={() => {
                              console.log('Manual map initialization triggered');
                              if (mapElRef.current && !mapRef.current) {
                                initializeMap();
                              }
                            }}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 mr-2"
                          >
                            Init Map
                          </button>
                          <button 
                            onClick={() => {
                              console.log('Manual route creation triggered');
                              if (selectedParcel) {
                                const createRoute = async () => {
                                  try {
                                    const pickup = await geocodeAddress(selectedParcel.pickupAddress);
                                    const delivery = await geocodeAddress(selectedParcel.deliveryAddress);
                                    setRouteData({ pickup, delivery });
                                  } catch (err) {
                                    console.error('Manual route creation failed:', err);
                                    setMapError('Manual route creation failed: ' + err.message);
                                  }
                                };
                                createRoute();
                              }
                            }}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            disabled={!selectedParcel}
                          >
                            Create Route
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>

            {/* Parcel Details */}
            {selectedParcel && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold text-gray-900">Parcel Details</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Tracking #{selectedParcel.trackingCode}
                  </p>
                </div>
                <div className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Tracking Code</label>
                      <p className="text-lg font-semibold text-gray-900">{selectedParcel.trackingCode}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <p className="text-lg font-semibold text-gray-900">{selectedParcel.status}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Pickup Address</label>
                      <p className="text-sm text-gray-900">{selectedParcel.pickupAddress}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Delivery Address</label>
                      <p className="text-sm text-gray-900">{selectedParcel.deliveryAddress}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Parcel Size</label>
                      <p className="text-sm text-gray-900">{selectedParcel.parcelSize}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Parcel Type</label>
                      <p className="text-sm text-gray-900">{selectedParcel.parcelType}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Payment Type</label>
                      <p className="text-sm text-gray-900">{selectedParcel.paymentType}</p>
                    </div>
                    {selectedParcel.paymentType === 'COD' && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">COD Amount</label>
                        <p className="text-sm text-gray-900">${selectedParcel.codAmount}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-500">Created Date</label>
                      <p className="text-sm text-gray-900">{new Date(selectedParcel.createdAt).toLocaleDateString()}</p>
                    </div>
                    {selectedParcel.notes && (
                      <div className="sm:col-span-2">
                        <label className="text-sm font-medium text-gray-500">Notes</label>
                        <p className="text-sm text-gray-900">{selectedParcel.notes}</p>
                      </div>
                    )}
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
