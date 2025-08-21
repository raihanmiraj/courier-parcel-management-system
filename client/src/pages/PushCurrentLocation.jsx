import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createSocket } from '../socket';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const PushCurrentLocation = () => {
    const [error, setError] = useState('');
    const [coords, setCoords] = useState(null);
    const [initialized, setInitialized] = useState(false);
    const agentIdRef = useRef('rider-live');

    const mapRef = useRef(null);
    const mapElRef = useRef(null);
    const markerRef = useRef(null);
    const simSocketRef = useRef(null);
    const geoWatchIdRef = useRef(null);

    useEffect(() => {
        // create a dedicated socket connection so broadcasts reach other pages using the default socket
        simSocketRef.current = createSocket(agentIdRef.current);
        return () => {
            try { simSocketRef.current?.disconnect(); } catch (_) {}
            simSocketRef.current = null;
        };
    }, []);

    const ensureMap = useCallback((center = [20, 0], zoom = 3) => {
        if (!mapRef.current && mapElRef.current) {
            mapRef.current = L.map(mapElRef.current).setView(center, zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
            }).addTo(mapRef.current);
        }
        return mapRef.current;
    }, []);

    // Start watching browser geolocation and emit updates continuously
    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setError('Geolocation is not supported by this browser.');
            return;
        }
        const onSuccess = (pos) => {
            const { latitude, longitude } = pos.coords;
            const next = [latitude, longitude];
            setCoords(next);
            simSocketRef.current?.emit('agent:location:update', {
                agentId: agentIdRef.current,
                location: { lat: next[0], lng: next[1] },
                timestamp: Date.now(),
            });
            if (!initialized) setInitialized(true);
        };
        const onError = (err) => {
            setError(err?.message || 'Failed to get current location');
        };
        try {
            geoWatchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 10000,
            });
        } catch (_) {}
        return () => {
            if (geoWatchIdRef.current != null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
        };
    }, [initialized]);

    useEffect(() => {
        if (!coords) return;
        const map = ensureMap(coords, 5);
        if (!map) return;

        const bikeIcon = L.divIcon({ html: '🏍️', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
        if (!markerRef.current) {
            markerRef.current = L.marker(coords, { icon: bikeIcon }).addTo(map);
        } else {
            markerRef.current.setLatLng(coords);
        }
        map.setView(coords, 6, { animate: true });
    }, [coords, ensureMap]);

    // Movement updates are user-driven only (no intervals)

    return (
        <div className="max-w-2xl mx-auto p-4 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-gray-800">Live Location Sharing</h2>
                <p className="text-sm text-gray-600">This page automatically shares your current location over the socket.</p>
                {coords ? (
                    <p className="text-sm"><span className="font-medium">Lat:</span> {coords[0].toFixed(6)} <span className="font-medium">Lng:</span> {coords[1].toFixed(6)}</p>
                ) : (
                    <p className="text-sm text-gray-500">Waiting for location…</p>
                )}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div ref={mapElRef} className="h-96 w-full" />
            </div>
        </div>
    );
}

export default PushCurrentLocation;
