import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
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

export default function CustomerParcelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [routeData, setRouteData] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const routingRef = useRef(null);
  const agentMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const deliveryMarkerRef = useRef(null);
  const socketRef = useRef(null);
  const agentIdRef = useRef(null);

  // Load parcel data
  useEffect(() => {
    setLoading(true);
    api.get(`/parcels/${id}`)
      .then(res => {
        setParcel(res.data);
        if (res.data.currentLocation) {
          setAgentLocation(res.data.currentLocation);
        }
      })
      .catch(() => setError('Failed to load parcel'))
      .finally(() => setLoading(false));
  }, [id]);

  // Keep current agentId in a ref to avoid stale closures in socket handler
  useEffect(() => {
    const nextId = parcel?.agent?._id || null;
    agentIdRef.current = nextId;
    console.log('CustomerParcelDetail: agentIdRef updated to', nextId);
  }, [parcel?.agent?._id]);

  // Listen for agent location updates using a dedicated socket
  useEffect(() => {
    const socketUserId = user?._id || `viewer:${Date.now()}`;
    const s = createSocket(socketUserId);
    socketRef.current = s;

    const handleAgentLocationUpdate = (data) => {
      console.log('CustomerParcelDetail: Agent location update received:', data);
      const targetAgentId = agentIdRef.current;
      if (targetAgentId && data.agentId === targetAgentId) {
        setAgentLocation({
          lat: data.location.lat,
          lng: data.location.lng,
          updatedAt: data.timestamp
        });
      }
    };

    const anyLogger = (event, ...args) => {
      if (event !== 'pong') {
        console.log('CustomerParcelDetail: socket event', event, args?.[0]);
      }
    };

    s.on('connect', () => console.log('CustomerParcelDetail: socket connected', s.id));
    s.on('disconnect', (reason) => console.log('CustomerParcelDetail: socket disconnected', reason));
    s.on('connect_error', (err) => console.log('CustomerParcelDetail: socket connect_error', err.message));

    s.on('agent:location:update', handleAgentLocationUpdate);
    s.onAny(anyLogger);

    return () => {
      s.off('agent:location:update', handleAgentLocationUpdate);
      s.offAny(anyLogger);
      s.disconnect();
    };
  }, [user?._id]);

  // Geocode addresses and create route
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

  // Initialize map
  const initializeMap = useCallback(() => {
    console.log('CustomerParcelDetail: initializeMap called', {
      mapElRef: !!mapElRef.current,
      mapRef: !!mapRef.current,
      mapElRefCurrent: mapElRef.current
    });

    if (!mapElRef.current || mapRef.current) {
      console.log('CustomerParcelDetail: Map already exists or container not ready');
      return;
    }

    setTimeout(() => {
      if (!mapElRef.current || mapRef.current) {
        console.log('CustomerParcelDetail: Map already exists or container not ready after timeout');
        return;
      }

      console.log('CustomerParcelDetail: Creating Leaflet map');
      const defaultCenter = [23.78, 90.41];
      const map = L.map(mapElRef.current).setView(defaultCenter, 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      mapRef.current = map;
      setMapInitialized(true);
      console.log('CustomerParcelDetail: Map initialized successfully');
    }, 100);
  }, []);

  useEffect(() => {
    initializeMap();
  }, [initializeMap]);

  useEffect(() => {
    if (mapElRef.current && !mapRef.current) {
      console.log('CustomerParcelDetail: Map container found, initializing map');
      initializeMap();
    }
  }, [mapElRef.current, initializeMap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapElRef.current && !mapRef.current) {
        console.log('CustomerParcelDetail: Fallback map initialization');
        initializeMap();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [initializeMap]);

  // Create route when parcel data is available
  useEffect(() => {
    if (!parcel) return;

    const createRoute = async () => {
      try {
        console.log('CustomerParcelDetail: Creating route for addresses:', {
          pickup: parcel.pickupAddress,
          delivery: parcel.deliveryAddress
        });
        const pickup = await geocodeAddress(parcel.pickupAddress);
        const delivery = await geocodeAddress(parcel.deliveryAddress);
        console.log('CustomerParcelDetail: Route coordinates:', { pickup, delivery });
        setRouteData({ pickup, delivery });
      } catch (err) {
        console.error('CustomerParcelDetail: Route creation failed:', err);
        setError('Failed to create route: ' + err.message);
      }
    };

    createRoute();
  }, [parcel, geocodeAddress]);

  // Create route on map when route data is available
  useEffect(() => {
    console.log('CustomerParcelDetail: Route effect triggered', {
      routeData,
      mapRef: !!mapRef.current,
      mapInitialized
    });

    if (!routeData || !mapRef.current || !mapInitialized) {
      console.log('CustomerParcelDetail: Missing dependencies for route creation');
      return;
    }

    const map = mapRef.current;
    const { pickup, delivery } = routeData;
    console.log('CustomerParcelDetail: Creating route on map', { pickup, delivery });

    if (routingRef.current) {
      try {
        map.removeControl(routingRef.current);
      } catch (_) { }
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

    pickupMarkerRef.current = L.marker(pickup, { icon: pickupIcon }).addTo(map);
    deliveryMarkerRef.current = L.marker(delivery, { icon: deliveryIcon }).addTo(map);

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
    }).addTo(map);

    const bounds = L.latLngBounds([pickup, delivery]);
    map.fitBounds(bounds, { padding: [50, 50] });
    console.log('CustomerParcelDetail: Route created successfully');
  }, [routeData, mapInitialized]);

  // Update agent marker when location changes
  useEffect(() => {
    console.log('CustomerParcelDetail: Agent location effect triggered:', agentLocation);
    if (!agentLocation?.lat || !agentLocation?.lng || !mapRef.current) {
      console.log('CustomerParcelDetail: Missing data for agent marker:', {
        agentLocation,
        mapRef: !!mapRef.current
      });
      return;
    }

    const map = mapRef.current;
    const location = [agentLocation.lat, agentLocation.lng];

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

    const bounds = map.getBounds();
    if (!bounds.contains(location)) {
      map.panTo(location, { animate: true });
    }
  }, [agentLocation, parcel?.agent]);

  useEffect(() => {
    return () => {
      if (routingRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(routingRef.current);
        } catch (_) { }
      }
      if (agentMarkerRef.current && mapRef.current) {
        try {
          mapRef.current.removeLayer(agentMarkerRef.current);
        } catch (_) { }
      }
      if (pickupMarkerRef.current && mapRef.current) {
        try {
          mapRef.current.removeLayer(pickupMarkerRef.current);
        } catch (_) { }
      }
      if (deliveryMarkerRef.current && mapRef.current) {
        try {
          mapRef.current.removeLayer(deliveryMarkerRef.current);
        } catch (_) { }
      }
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (_) { }
        mapRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading parcel details...</p>
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
            onClick={() => navigate('/customer')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!parcel) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/customer')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Parcel Details</h1>
                <p className="text-gray-600">Tracking #{parcel.trackingCode}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Parcel Information</h2>
              </div>
              <div className="p-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tracking Code</label>
                    <p className="text-lg font-semibold text-gray-900">{parcel.trackingCode}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <p className="text-lg font-semibold text-gray-900">{parcel.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Pickup Address</label>
                    <p className="text-sm text-gray-900">{parcel.pickupAddress}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Delivery Address</label>
                    <p className="text-sm text-gray-900">{parcel.deliveryAddress}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Parcel Size</label>
                    <p className="text-sm text-gray-900">{parcel.parcelSize}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Parcel Type</label>
                    <p className="text-sm text-gray-900">{parcel.parcelType}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Type</label>
                    <p className="text-sm text-gray-900">{parcel.paymentType}</p>
                  </div>
                  {parcel.paymentType === 'COD' && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">COD Amount</label>
                      <p className="text-sm text-gray-900">${parcel.codAmount}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-500">Created Date</label>
                    <p className="text-sm text-gray-900">{new Date(parcel.createdAt).toLocaleDateString()}</p>
                  </div>
                  {parcel.notes && (
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-500">Notes</label>
                      <p className="text-sm text-gray-900">{parcel.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Delivery Route</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time tracking from pickup to delivery location
                </p>
              </div>
              <div className="p-6">
                <div className="relative">
                  <div
                    ref={mapElRef}
                    className="h-96 w-full rounded-lg overflow-hidden border bg-gray-100"
                    style={{ minHeight: '384px' }}
                  />
                  {!mapInitialized && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading map...</p>
                      </div>
                    </div>
                  )}
                </div>
                {agentLocation && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-blue-800">Live tracking active</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      Agent location updated: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {parcel.agent && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">Delivery Agent</h3>
                </div>
                <div className="p-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">🚚</span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{parcel.agent.name}</h4>
                    <p className="text-sm text-gray-600">{parcel.agent.email}</p>
                    {agentLocation && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium text-green-800">Online</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border shadow sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Delivery Details</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Estimated Delivery</label>
                  <p className="text-sm text-gray-900">
                    {parcel.etaMinutes ? `${parcel.etaMinutes} minutes` : 'Calculating...'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Distance</label>
                  <p className="text-sm text-gray-900">
                    {routeData ? 'Route calculated' : 'Calculating route...'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Updated</label>
                  <p className="text-sm text-gray-900">
                    {parcel.updatedAt ? new Date(parcel.updatedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
              </div>
              <div className="p-6 space-y-3">
                {parcel.status === 'In Transit' && (
                  <button
                    onClick={() => navigate(`/customer/parcel/${parcel._id}/track`)}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    🚚 Live Track
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  🖨️ Print Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
