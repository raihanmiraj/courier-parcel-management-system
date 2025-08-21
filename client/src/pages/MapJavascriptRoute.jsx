import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { socket } from '../socket';
import { api } from '../api';

// Fix default marker icons in bundlers like Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const MapJavascriptRoute = () => {
    const [startQuery, setStartQuery] = useState('');
    const [endQuery, setEndQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mapVisible, setMapVisible] = useState(false);
    const [routePoints, setRoutePoints] = useState(null);
    const [riderLocation, setRiderLocation] = useState(null);

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const routingControlRef = useRef(null);
    const riderMarkerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    const geocodeAddress = useCallback(async (query) => {
        const { data } = await api.get(`/geocode/search`, { params: { q: query, limit: 1 } });
        const dataArr = data;
        if (!Array.isArray(dataArr) || dataArr.length === 0) {
            throw new Error('Location not found');
        }
        const { lat, lon } = dataArr[0];
        return [parseFloat(lat), parseFloat(lon)];
    }, []);

    const ensureMap = useCallback((center) => {
        if (!mapInstanceRef.current) {
            if (!mapContainerRef.current) return null;
            mapInstanceRef.current = L.map(mapContainerRef.current).setView(center, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
            }).addTo(mapInstanceRef.current);
        }
        return mapInstanceRef.current;
    }, []);

    const createOrUpdateRoute = useCallback((startLatLng, endLatLng) => {
        const map = ensureMap(startLatLng);
        if (!map) return;

        if (routingControlRef.current) {
            try {
                map.removeControl(routingControlRef.current);
            } catch (_) {
                // ignore if already removed
            }
            routingControlRef.current = null;
        }

        routingControlRef.current = L.Routing.control({
            waypoints: [L.latLng(startLatLng[0], startLatLng[1]), L.latLng(endLatLng[0], endLatLng[1])],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            lineOptions: { styles: [{ color: '#2563eb', opacity: 0.85, weight: 6 }] },
            addWaypoints: false,
            draggableWaypoints: true,
            fitSelectedRoutes: true,
            show: false,
        }).addTo(map);
    }, [ensureMap]);

    const handleRoute = useCallback(async () => {
        setError('');
        if (!startQuery.trim() || !endQuery.trim()) {
            setError('Please enter both start and destination locations.');
            return;
        }
        setLoading(true);
        try {
            const [startLat, startLng] = await geocodeAddress(startQuery.trim());
            const [endLat, endLng] = await geocodeAddress(endQuery.trim());
            setMapVisible(true);
            setRoutePoints({ start: [startLat, startLng], end: [endLat, endLng] });
        } catch (e) {
            setError(e?.message || 'Failed to compute route.');
        } finally {
            setLoading(false);
        }
    }, [createOrUpdateRoute, endQuery, geocodeAddress, startQuery]);

    useEffect(() => {
        if (!mapVisible || !routePoints) return;
        const { start, end } = routePoints;
        if (!start || !end) return;
        createOrUpdateRoute(start, end);
    }, [mapVisible, routePoints, createOrUpdateRoute]);

    // Listen for rider live location via socket and show as a small bike icon
    useEffect(() => {
        const handleRiderLocation = (payload) => {
            const { location } = payload || {};
            if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return;
            setRiderLocation([location.lat, location.lng]);
            if (!mapVisible) setMapVisible(true);
        };

        socket.on('agent:location:update', handleRiderLocation);
        return () => {
            socket.off('agent:location:update', handleRiderLocation);
        };
    }, [mapVisible]);

    useEffect(() => {
        if (!riderLocation) return;
        const map = ensureMap(riderLocation);
        if (!map) return;

        // Small bike icon using a div icon (emoji)
        const bikeIcon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });

        if (!riderMarkerRef.current) {
            riderMarkerRef.current = L.marker(riderLocation, { icon: bikeIcon }).addTo(map);
        } else {
            riderMarkerRef.current.setLatLng(riderLocation);
        }

        // Keep current zoom; only pan if marker would be outside the viewport
        const bounds = map.getBounds();
        if (!bounds.contains(riderLocation)) {
            map.panTo(riderLocation, { animate: true });
        }
    }, [riderLocation, ensureMap]);

    return (
        <div className="max-w-3xl mx-auto p-4 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">Route Planner</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start location</label>
                        <input
                            type="text"
                            value={startQuery}
                            onChange={(e) => setStartQuery(e.target.value)}
                            placeholder="e.g., Times Square, New York"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                        <input
                            type="text"
                            value={endQuery}
                            onChange={(e) => setEndQuery(e.target.value)}
                            placeholder="e.g., Central Park, New York"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleRoute}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Routing…' : 'Route Map'}
                    </button>
                    {error ? (
                        <span className="text-sm text-red-600">{error}</span>
                    ) : null}
                </div>
            </div>

            {mapVisible ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                    <div className="h-96 w-full rounded-md overflow-hidden" ref={mapContainerRef} />
                </div>
            ) : null}
        </div>
    );
};

export default MapJavascriptRoute;
