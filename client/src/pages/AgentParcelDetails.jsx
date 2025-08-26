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
    
    const socketUserId = `agent-tracking:${user?._id}:${parcel.agent._id}:${Date.now()}`;
    const s = createSocket(socketUserId);
    socketRef.current = s;

    const handleAgentLocationUpdate = (data) => {
      console.log('AgentParcelDetails: Agent location update received:', data);
      if (data.agentId === parcel.agent._id) {
        const newLocation = {
          lat: data.location.lat,
          lng: data.location.lng,
          updatedAt: data.timestamp || new Date().toISOString()
        };
        console.log('AgentParcelDetails: Setting new agent location:', newLocation);
        setAgentLocation(newLocation);
        
        // If map is ready, update the agent marker immediately
        if (mapRef.current && mapInitialized) {
          updateAgentMarkerOnMap(newLocation);
        }
      }
    };

    const handleSocketConnect = () => {
      console.log('AgentParcelDetails: Socket connected for agent tracking');
    };

    const handleSocketDisconnect = (reason) => {
      console.log('AgentParcelDetails: Socket disconnected:', reason);
    };

    const handleSocketError = (error) => {
      console.error('AgentParcelDetails: Socket error:', error);
    };

    s.on('connect', handleSocketConnect);
    s.on('disconnect', handleSocketDisconnect);
    s.on('connect_error', handleSocketError);
    s.on('agent:location:update', handleAgentLocationUpdate);

    return () => {
      s.off('connect', handleSocketConnect);
      s.off('disconnect', handleSocketDisconnect);
      s.off('connect_error', handleSocketError);
      s.off('agent:location:update', handleAgentLocationUpdate);
      s.disconnect();
    };
  }, [parcel?._id, parcel?.agent?._id, user?._id, mapInitialized]);

  // Function to update agent marker on map
  const updateAgentMarkerOnMap = useCallback((location) => {
    console.log('AgentParcelDetails: updateAgentMarkerOnMap called with:', location);
    console.log('AgentParcelDetails: Map state:', {
      mapRef: !!mapRef.current,
      mapInitialized,
      mapError
    });

    if (!mapRef.current || !mapInitialized) {
      console.log('AgentParcelDetails: Map not ready, cannot update agent marker');
      return;
    }

    if (!location || !location.lat || !location.lng) {
      console.log('AgentParcelDetails: Invalid location data:', location);
      return;
    }

    const map = mapRef.current;
    const locationArray = [location.lat, location.lng];

    try {
      console.log('AgentParcelDetails: Updating agent marker at:', locationArray);
      
      const bikeIcon = L.divIcon({
        html: '🏍️',
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      if (!agentMarkerRef.current) {
        console.log('AgentParcelDetails: Creating new agent marker');
        agentMarkerRef.current = L.marker(locationArray, { icon: bikeIcon }).addTo(map);
        if (parcel?.agent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${parcel.agent.name}</div>
              <div class="text-sm text-gray-600">Delivery Agent</div>
              <div class="text-xs text-gray-500">Last updated: ${new Date(location.updatedAt).toLocaleTimeString()}</div>
              <div class="text-xs text-gray-500">Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</div>
            </div>
          `);
        }
      } else {
        console.log('AgentParcelDetails: Updating existing agent marker');
        agentMarkerRef.current.setLatLng(locationArray);
        
        // Update popup content with new timestamp
        if (parcel?.agent) {
          agentMarkerRef.current.bindPopup(`
            <div class="text-center">
              <div class="font-semibold">🚚 ${parcel.agent.name}</div>
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
        console.log('AgentParcelDetails: Panning map to agent location');
        map.panTo(locationArray, { animate: true });
      }
      
      console.log('AgentParcelDetails: Agent marker updated successfully');
    } catch (err) {
      console.error('AgentParcelDetails: Error updating agent marker:', err);
    }
  }, [parcel?.agent, mapInitialized]);

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

  // Initialize map with proper error handling and multiple fallback mechanisms
  const initializeMap = useCallback(() => {
    console.log('AgentParcelDetails: initializeMap called', {
      mapElRef: !!mapElRef.current,
      mapRef: !!mapRef.current,
      mapElRefCurrent: mapElRef.current
    });

    if (!mapElRef.current || mapRef.current) {
      console.log('AgentParcelDetails: Map already exists or container not ready');
      return;
    }

    // Check if the container is properly rendered and has dimensions
    const container = mapElRef.current;
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.log('AgentParcelDetails: Container has no dimensions, retrying...');
      setTimeout(() => initializeMap(), 200);
      return;
    }

    try {
      console.log('AgentParcelDetails: Creating Leaflet map');
      const defaultCenter = [23.78, 90.41]; // Default to Dhaka, Bangladesh
      const map = L.map(container).setView(defaultCenter, 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
      setMapInitialized(true);
      setMapError('');
      console.log('AgentParcelDetails: Map initialized successfully');
      
      // If we have agent location data, add it to the map immediately
      if (agentLocation && agentLocation.lat && agentLocation.lng) {
        console.log('AgentParcelDetails: Adding initial agent location to map');
        updateAgentMarkerOnMap(agentLocation);
      }
      
    } catch (err) {
      console.error('AgentParcelDetails: Map initialization failed:', err);
      setMapError('Failed to initialize map: ' + err.message);
      
      // Try to recover by attempting again after a delay
      setTimeout(() => {
        if (!mapRef.current && mapElRef.current) {
          console.log('AgentParcelDetails: Retrying map initialization after error');
          initializeMap();
        }
      }, 1000);
    }
  }, [agentLocation, updateAgentMarkerOnMap]);

  // Initialize map when component mounts
  useEffect(() => {
    // Wait for the component to be fully rendered
    const timer = setTimeout(() => {
      console.log('AgentParcelDetails: Component mounted, attempting map initialization');
      initializeMap();
    }, 100);
    
    // Also try with requestAnimationFrame for better timing
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current && mapElRef.current) {
        console.log('AgentParcelDetails: RAF map initialization attempt');
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
        console.log('AgentParcelDetails: Map container found, initializing map');
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
            console.log('AgentParcelDetails: Container resized, attempting map initialization');
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

  // Fallback map initialization with multiple attempts
  useEffect(() => {
    const timers = [];
    
    // Multiple fallback attempts at different intervals
    [500, 1000, 2000].forEach(delay => {
      const timer = setTimeout(() => {
        if (mapElRef.current && !mapRef.current) {
          console.log(`AgentParcelDetails: Fallback map initialization attempt at ${delay}ms`);
          initializeMap();
        }
      }, delay);
      timers.push(timer);
    });
    
    return () => timers.forEach(timer => clearTimeout(timer));
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

  // Update agent marker when location changes (fallback for initial load)
  useEffect(() => {
    if (!agentLocation?.lat || !agentLocation?.lng || !mapRef.current || !mapInitialized) return;
    
    // Use the dedicated function to update the marker
    updateAgentMarkerOnMap(agentLocation);
  }, [agentLocation, mapInitialized, updateAgentMarkerOnMap]);

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
              {/* Real-time Tracking Status */}
              {agentLocation && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium text-green-800">Live Tracking</span>
                </div>
              )}
              
              {/* Socket Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs ${
                socketRef.current?.connected 
                  ? 'bg-blue-50 border-blue-200 text-blue-800' 
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  socketRef.current?.connected ? 'bg-blue-500' : 'bg-gray-400'
                }`}></div>
                <span className="font-medium">
                  {socketRef.current?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                disabled={!(parcel?.status === 'Picked Up' || parcel?.status === 'In Transit' || parcel?.status === 'Delivered' || parcel?.status === 'Failed')}
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                <option value="Pending">Pending</option>
                <option value="Assigned">Assigned</option>
                <option value="Picked Up">Picked Up</option>
                <option value="In Transit">In Transit</option>
                <option value="Delivered">Delivered</option>
                <option value="Failed">Failed</option>
              </select>
              {!(parcel?.status === 'Picked Up' || parcel?.status === 'In Transit' || parcel?.status === 'Delivered' || parcel?.status === 'Failed') && (
                <div className="text-xs text-gray-500">Scan customer QR to enable status updates.</div>
              )}
              <button 
                onClick={updateStatus}
                disabled={updatingStatus || status === parcel.status}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatingStatus ? t.updating : t.updateStatus}
              </button>
              {!(parcel?.status === 'Picked Up' || parcel?.status === 'In Transit' || parcel?.status === 'Delivered' || parcel?.status === 'Failed') && (
                <button 
                  onClick={() => navigate('/agent/pickup-scan')}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                >
                  Scan to Pick Up
                </button>
              )}
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
                  <div className="mt-4 space-y-3">
                    {/* Live Tracking Status */}
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-blue-800">{t.liveTrackingActive}</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">
                        {t.agentLocationUpdated}: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
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
                        {routeData && (
                          <div>
                            Route Data: ✅ Pickup & Delivery coordinates loaded
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
