import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { createSocket } from '../socket';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  const [agentSpeed, setAgentSpeed] = useState(null);
  const [previousAgentLocation, setPreviousAgentLocation] = useState(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState(null);
  const [agentParcels, setAgentParcels] = useState([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState('');

  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const agentMarkerRef = useRef(null);

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

  // Function to update agent marker on map
  const updateAgentMarkerOnMap = useCallback((location) => {
    if (!mapRef.current || !mapInitialized) {
      return;
    }

    if (!location || !location.lat || !location.lng) {
      return;
    }

    const map = mapRef.current;
    const locationArray = [location.lat, location.lng];

    try {
      const bikeIcon = L.divIcon({
        html: '🏍️',
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      if (!agentMarkerRef.current) {
        agentMarkerRef.current = L.marker(locationArray, { icon: bikeIcon }).addTo(map);
        if (selectedAgent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${selectedAgent.name}</div>
              <div class="text-sm text-gray-600">Delivery Agent</div>
              <div class="text-xs text-gray-500">Last updated: ${new Date(location.updatedAt).toLocaleTimeString()}</div>
              <div class="text-xs text-gray-500">Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</div>
            </div>
          `);
        }
      } else {
        agentMarkerRef.current.setLatLng(locationArray);
        
        // Update popup content with new timestamp
        if (selectedAgent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${selectedAgent.name}</div>
              <div class="text-sm text-gray-600">Delivery Agent</div>
              <div class="text-xs text-gray-500">Last updated: ${new Date(location.updatedAt).toLocaleTimeString()}</div>
              <div class="text-xs text-gray-500">Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</div>
            </div>
          `);
        }
      }

      // Ensure the agent location is visible on the map
      const bounds = map.getBounds();
      if (!bounds.contains(locationArray)) {
        map.panTo(locationArray, { animate: true });
      }
    } catch (err) {
      console.error('Error updating agent marker:', err);
    }
  }, [selectedAgent, mapInitialized]);

  // Initialize map with proper error handling
  const initializeMap = useCallback(() => {
    if (!mapElRef.current || mapRef.current) {
      return;
    }

    // Check if the container is properly rendered and has dimensions
    const container = mapElRef.current;
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      setTimeout(() => initializeMap(), 200);
      return;
    }

    try {
      const defaultCenter = [23.78, 90.41]; // Default to Dhaka, Bangladesh
      const map = L.map(container).setView(defaultCenter, 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
      setMapInitialized(true);
      setMapError('');
      
      // If we have agent location data, add it to the map immediately
      if (agentLocation && agentLocation.lat && agentLocation.lng) {
        updateAgentMarkerOnMap(agentLocation);
      }
      
    } catch (err) {
      console.error('Map initialization failed:', err);
      setMapError('Failed to initialize map: ' + err.message);
      
      // Try to recover by attempting again after a delay
      setTimeout(() => {
        if (!mapRef.current && mapElRef.current) {
          initializeMap();
        }
      }, 1000);
    }
  }, [agentLocation, updateAgentMarkerOnMap]);

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
    
    setParcelsLoading(true);
    setAgentLocation(null);
    setAgentSpeed(null);
    setPreviousAgentLocation(null);
    setLastLocationUpdate(null);
    
    api.get(`/parcels?agent=${selectedAgent._id}`)
      .then(res => {
        setAgentParcels(res.data);
      })
      .catch(() => setError('Failed to load agent parcels'))
      .finally(() => setParcelsLoading(false));
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
        
        // Update map marker if map is ready
        if (mapRef.current && mapInitialized) {
          updateAgentMarkerOnMap(newLocation);
        }
      }
    };

    s.on('agent:location:update', handleAgentLocationUpdate);

    return () => {
      s.off('agent:location:update', handleAgentLocationUpdate);
      s.disconnect();
    };
  }, [selectedAgent, user?._id, agentLocation, lastLocationUpdate, calculateAgentSpeed, mapInitialized, updateAgentMarkerOnMap]);

  // Initialize map when component mounts
  useEffect(() => {
    // Wait for the component to be fully rendered
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);
    
    // Also try with requestAnimationFrame for better timing
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current && mapElRef.current) {
        initializeMap();
      }
    });
    
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId);
    };
  }, [initializeMap]);

  // Monitor map container element and retry initialization if needed
  useEffect(() => {
    const checkAndInitialize = () => {
      if (mapElRef.current && !mapRef.current) {
        initializeMap();
      }
    };

    // Check immediately
    checkAndInitialize();
    
    // Check again after a short delay
    const timer = setTimeout(checkAndInitialize, 100);
    
    // Use ResizeObserver to detect when container is properly sized
    let resizeObserver = null;
    if (mapElRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0 && !mapRef.current) {
            initializeMap();
          }
        }
      });
      resizeObserver.observe(mapElRef.current);
    }
    
    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [initializeMap]);

  // Update agent marker when location changes (fallback for initial load)
  useEffect(() => {
    if (!agentLocation?.lat || !agentLocation?.lng || !mapRef.current || !mapInitialized) return;
    
    // Use the dedicated function to update the marker
    updateAgentMarkerOnMap(agentLocation);
  }, [agentLocation, mapInitialized, updateAgentMarkerOnMap]);

  // Fallback map initialization with multiple attempts
  useEffect(() => {
    const timers = [];
    
    // Multiple fallback attempts at different intervals
    [500, 1000, 2000].forEach(delay => {
      const timer = setTimeout(() => {
        if (mapElRef.current && !mapRef.current) {
          console.log(`Fallback map initialization attempt at ${delay}ms`);
          initializeMap();
        }
      }, delay);
      timers.push(timer);
    });
    
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [initializeMap]);

  // Cleanup function
  useEffect(() => {
    return () => {
      try {
        if (agentMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(agentMarkerRef.current);
        }
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      } catch (err) {
        console.error('Error during cleanup:', err);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
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

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Agent Selection and Details */}
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

            {/* Agent Live Metrics */}
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
          </div>

          {/* Agent Parcels List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Parcels Assigned to Agent */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Parcels Assigned to Agent</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedAgent ? `Showing parcels for ${selectedAgent.name}` : 'Select an agent to view parcels'}
                </p>
              </div>
              <div className="p-6">
                {!selectedAgent ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">📦</div>
                    <p>Please select an agent to view their assigned parcels</p>
                  </div>
                ) : parcelsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">Loading parcels...</p>
                  </div>
                ) : agentParcels.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">📭</div>
                    <p>No parcels assigned to this agent</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {agentParcels.map(parcel => (
                      <div key={parcel._id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-gray-900">#{parcel.trackingCode}</h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                parcel.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                                parcel.status === 'In Transit' ? 'bg-blue-100 text-blue-800' :
                                parcel.status === 'Failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {parcel.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                              <div>
                                <span className="font-medium">Pickup:</span> {parcel.pickupAddress}
                              </div>
                              <div>
                                <span className="font-medium">Delivery:</span> {parcel.deliveryAddress}
                              </div>
                              <div>
                                <span className="font-medium">Size:</span> {parcel.parcelSize}
                              </div>
                              <div>
                                <span className="font-medium">Type:</span> {parcel.parcelType}
                              </div>
                            </div>
                            {parcel.notes && (
                              <div className="mt-2 text-sm text-gray-500">
                                <span className="font-medium">Notes:</span> {parcel.notes}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            <div>Created: {new Date(parcel.createdAt).toLocaleDateString()}</div>
                            <div>Updated: {new Date(parcel.updatedAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Live Tracking Status */}
            {selectedAgent && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold text-gray-900">Live Tracking Status</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedAgent.name}'s real-time location updates
                  </p>
                </div>
                <div className="p-6">
                  {agentLocation ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-blue-800">{t.liveTrackingActive}</span>
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          {t.agentLocationUpdated}: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <label className="text-xs font-medium text-green-600 uppercase tracking-wide">Latitude</label>
                          <p className="text-lg font-bold text-green-900">{agentLocation.lat.toFixed(6)}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <label className="text-xs font-medium text-green-600 uppercase tracking-wide">Longitude</label>
                          <p className="text-lg font-bold text-green-900">{agentLocation.lng.toFixed(6)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-4xl mb-2">📍</div>
                      <p>Waiting for location updates from agent</p>
                      <p className="text-sm mt-1">Location will appear here when agent shares their position</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Agent Tracking Map */}
        {selectedAgent && (
          <div className="mt-8">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Live Agent Tracking Map</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time location tracking of {selectedAgent.name} on the map
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
                      </div>
                    </div>
                  )}
                </div>
                
                {agentLocation && (
                  <div className="mt-4 space-y-3">
                    {/* Live Tracking Status */}
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-blue-800">Live Tracking Active</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">
                        Agent location updated: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    
                    {/* Agent Location Coordinates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <label className="text-xs font-medium text-green-600 uppercase tracking-wide">Latitude</label>
                        <p className="text-lg font-bold text-green-900">{agentLocation.lat.toFixed(6)}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <label className="text-xs font-medium text-green-600 uppercase tracking-wide">Longitude</label>
                        <p className="text-lg font-bold text-green-900">{agentLocation.lng.toFixed(6)}</p>
                      </div>
                    </div>
                    
                    {/* Real-time Updates Info */}
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-purple-800">Real-time Updates Active</span>
                      </div>
                      <p className="text-xs text-purple-600 mt-1">
                        Agent location updates automatically via WebSocket connection
                      </p>
                    </div>
                  </div>
                )}
                
                {/* No Location Status */}
                {!agentLocation && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-center">
                      <div className="text-2xl mb-2">📍</div>
                      <p className="text-sm font-medium text-yellow-800">Waiting for Agent Location</p>
                      <p className="text-xs text-yellow-600 mt-1">
                        Agent location will appear here when they share their position
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Debug Information for Development */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-gray-700">Debug Info</summary>
                      <div className="mt-2 space-y-1 text-gray-600">
                        <div>Map Initialized: {mapInitialized ? '✅' : '❌'}</div>
                        <div>Map Element: {mapElRef.current ? '✅' : '❌'}</div>
                        <div>Map Instance: {mapRef.current ? '✅' : '❌'}</div>
                        <div>Map Error: {mapError || 'None'}</div>
                        <div>Agent Location: {agentLocation ? '✅' : '❌'}</div>
                        <div>Socket Connected: {socketRef.current?.connected ? '✅' : '❌'}</div>
                        {agentLocation && (
                          <div>
                            Last Update: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <button 
                            onClick={() => {
                              console.log('Manual map initialization triggered');
                              if (mapElRef.current && !mapRef.current) {
                                initializeMap();
                              } else {
                                console.log('Map already exists or container not ready');
                              }
                            }}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 mr-2"
                          >
                            Init Map
                          </button>
                          <button 
                            onClick={() => {
                              console.log('Force map re-initialization');
                              if (mapRef.current) {
                                try {
                                  mapRef.current.remove();
                                  mapRef.current = null;
                                  setMapInitialized(false);
                                } catch (_) { }
                              }
                              setTimeout(() => initializeMap(), 100);
                            }}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 mr-2"
                          >
                            Reset Map
                          </button>
                          <button 
                            onClick={() => {
                              console.log('Test agent location update');
                              if (agentLocation) {
                                const testLocation = {
                                  ...agentLocation,
                                  updatedAt: new Date().toISOString()
                                };
                                setAgentLocation(testLocation);
                                updateAgentMarkerOnMap(testLocation);
                              }
                            }}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            disabled={!agentLocation}
                          >
                            Test Update
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
