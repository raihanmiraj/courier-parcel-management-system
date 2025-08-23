import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GoogleMap, DirectionsRenderer, Marker, useJsApiLoader } from '@react-google-maps/api';
import { socket } from '../socket';
import { api } from '../api';

const STATUS_STEPS = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed"];

export default function PublicTrack() {
  const { trackingCode } = useParams();
  const [parcel, setParcel] = useState(null);
  const [directions, setDirections] = useState(null);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });

  useEffect(() => {
    api.get(`/parcels/track/${trackingCode}`)
      .then(res => {
        const data = res.data;
        if (data.message) setError(data.message); else setParcel(data);
      })
      .catch(() => setError('Failed to load parcel'))
      .finally(() => setLoading(false));
  }, [trackingCode]);
 
  useEffect(() => {
    if (!parcel) return; 
    socket.emit('subscribe:parcel', parcel._id); 
    const handleParcelUpdate = (updatedParcel) => {
      if (updatedParcel.id === parcel._id) {
        setParcel(prev => ({ ...prev, ...updatedParcel }));
      }
    };
 
    const handleLocationUpdate = (data) => {
      if (data.id === parcel._id) {
        setParcel(prev => ({ 
          ...prev, 
          currentLocation: data.currentLocation, 
          etaMinutes: data.etaMinutes 
        }));
      }
    };
 
    const handleAgentLocationUpdate = (data) => {
      if (parcel.agent && data.agentId === parcel.agent._id) {
        setParcel(prev => ({ 
          ...prev, 
          currentLocation: { ...data.location, updatedAt: data.timestamp } 
        }));
      }
    };

    socket.on('parcel:update', handleParcelUpdate);
    socket.on('parcel:location', handleLocationUpdate);
    socket.on('agent:location:update', handleAgentLocationUpdate);

    return () => {
      socket.emit('unsubscribe:parcel', parcel._id);
      socket.off('parcel:update', handleParcelUpdate);
      socket.off('parcel:location', handleLocationUpdate);
      socket.off('agent:location:update', handleAgentLocationUpdate);
    };
  }, [parcel]);

  useEffect(() => {
    if (!isLoaded || !window.google || !parcel) return;
    const svc = new window.google.maps.DirectionsService();
    const origin = parcel.pickupAddress;
    const destination = parcel.deliveryAddress;

    if (parcel.currentLocation?.lat && parcel.currentLocation?.lng) {
      // live origin is agent
      svc.route({
        origin: { lat: parcel.currentLocation.lat, lng: parcel.currentLocation.lng },
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (res, status) => {
        if (status === 'OK') {
          setDirections(res);
          const leg = res.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        }
      });
    } else {
      svc.route({ origin, destination, travelMode: window.google.maps.TravelMode.DRIVING }, (res, status) => {
        if (status === 'OK') {
          setDirections(res);
          const leg = res.routes[0].legs[0];
          setDistance(leg.distance?.text || null);
          setDuration(leg.duration?.text || null);
        }
      });
    }
  }, [isLoaded, parcel]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading parcel information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Parcel Not Found</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Tracking Code: {trackingCode}</p>
        </div>
      </div>
    );
  }

  const currentIdx = STATUS_STEPS.indexOf(parcel.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">C</div>
            <span className="font-semibold">Courier Manager</span>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Tracking #{parcel.trackingCode}</h3>
            <div className="text-sm text-gray-600">Status: <span className="rounded-full bg-gray-100 px-2 py-0.5">{parcel.status}</span></div>
          </div>
          <ol className="flex items-center gap-4 overflow-x-auto">
            {STATUS_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${i<=currentIdx ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{i+1}</div>
                <span className={`text-sm ${i<=currentIdx ? 'font-medium' : 'text-gray-500'}`}>{s}</span>
                {i<STATUS_STEPS.length-1 && <div className={`mx-2 h-px w-10 ${i<currentIdx ? 'bg-brand-600' : 'bg-gray-300'}`}></div>}
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
            <div className="h-[500px] w-full overflow-hidden rounded-lg">
              {isLoaded && (
                <GoogleMap 
                  mapContainerStyle={{ width: '100%', height: '100%' }} 
                  center={{ lat: parcel.currentLocation?.lat || 23.78, lng: parcel.currentLocation?.lng || 90.41 }} 
                  zoom={11}
                >
                  {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: false }} />}
                  {parcel.currentLocation && (
                    <Marker 
                      position={{ lat: parcel.currentLocation.lat, lng: parcel.currentLocation.lng }} 
                      title="Courier Location" 
                    />
                  )}
                </GoogleMap>
              )}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h4 className="mb-2 text-base font-semibold">Trip Details</h4>
            <div className="space-y-1 text-sm">
              <div><span className="text-gray-500">From:</span> {parcel.pickupAddress}</div>
              <div><span className="text-gray-500">To:</span> {parcel.deliveryAddress}</div>
              <div><span className="text-gray-500">Distance:</span> {distance ?? '—'}</div>
              <div><span className="text-gray-500">ETA:</span> {parcel.etaMinutes ? `${parcel.etaMinutes} min` : (duration ?? '—')}</div>
              <div><span className="text-gray-500">Payment:</span> {parcel.paymentType}{parcel.paymentType==='COD' ? ` ($${parcel.codAmount})` : ''}</div>
              {parcel.agent && <div><span className="text-gray-500">Agent:</span> {parcel.agent.name}</div>}
              {parcel.currentLocation && (
                <div><span className="text-gray-500">Last Update:</span> {new Date(parcel.currentLocation.updatedAt).toLocaleString()}</div>
              )}
            </div>
            
            {/* Live Location Information */}
            {parcel.currentLocation && (
              <div className="mt-4 pt-4 border-t">
                <h5 className="mb-2 text-sm font-semibold text-green-600">🟢 Live Tracking Active</h5>
                <div className="space-y-1 text-xs text-gray-600">
                  <div><span className="text-gray-500">Latitude:</span> {parcel.currentLocation.lat.toFixed(6)}</div>
                  <div><span className="text-gray-500">Longitude:</span> {parcel.currentLocation.lng.toFixed(6)}</div>
                  <div className="text-green-600 font-medium">Real-time updates enabled</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
