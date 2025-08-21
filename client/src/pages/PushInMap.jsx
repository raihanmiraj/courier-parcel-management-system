import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createSocket } from '../socket';
import { api } from '../api';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const PushInMap = () => {
    const [country, setCountry] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [coords, setCoords] = useState(null);
    const agentIdRef = useRef('rider-simulator');

    const mapRef = useRef(null);
    const mapElRef = useRef(null);
    const markerRef = useRef(null);
    const simSocketRef = useRef(null);

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

    const geocodeCountry = useCallback(async (name) => {
        const { data } = await api.get('/geocode/search', { params: { q: name, limit: 1 } });
        if (!data?.length) throw new Error('Country not found');
        const { lat, lon } = data[0];
        return [parseFloat(lat), parseFloat(lon)];
    }, []);

    const sendNearbyUpdate = useCallback(() => {
        if (!coords) {
            setError('Locate a country first');
            return;
        }
        const deltaLat = (Math.random() - 0.5) * 0.001;
        const deltaLng = (Math.random() - 0.5) * 0.001;
        const next = [coords[0] + deltaLat, coords[1] + deltaLng];
        setCoords(next);
        simSocketRef.current?.emit('agent:location:update', {
            agentId: agentIdRef.current,
            location: { lat: next[0], lng: next[1] },
            timestamp: Date.now(),
        });
    }, [coords]);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        setError('');
        if (!country.trim()) {
            setError('Enter country name');
            return;
        }
        setLoading(true);
        try {
            const [lat, lng] = await geocodeCountry(country.trim());
            const initial = [lat, lng];
            setCoords(initial);
            // emit initial location
            simSocketRef.current?.emit('agent:location:update', {
                agentId: agentIdRef.current,
                location: { lat: initial[0], lng: initial[1] },
                timestamp: Date.now(),
            });
        } catch (err) {
            setError(err?.message || 'Failed');
        } finally {
            setLoading(false);
        }
    }, [country, geocodeCountry]);

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
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Country</label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Bangladesh"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                    />
                    <button type="submit" disabled={loading} className="rounded-md bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 disabled:opacity-60">{loading ? 'Loading…' : 'Locate'}</button>
                    <button type="button" onClick={sendNearbyUpdate} disabled={!coords} className="rounded-md bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700 disabled:opacity-60">Send Nearby Update</button>
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div ref={mapElRef} className="h-96 w-full" />
            </div>
        </div>
    );
}

export default PushInMap;
