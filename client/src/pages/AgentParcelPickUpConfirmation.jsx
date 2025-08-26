import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { BrowserMultiFormatReader } from '@zxing/browser';

export default function AgentParcelPickUpConfirmation() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [detectedId, setDetectedId] = useState('');
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let intervalId;
    let detector;
    let zxingReader;
    const init = async () => {
      try {
        setError('');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('muted', 'true');
          videoRef.current.muted = true;
          await videoRef.current.play();
        }
        if ('BarcodeDetector' in window) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const scan = async () => {
            try {
              if (!videoRef.current) return;
              const codes = await detector.detect(videoRef.current);
              if (codes && codes.length > 0) {
                const rawValue = codes[0].rawValue || '';
                const id = extractParcelId(rawValue);
                if (id) {
                  setDetectedId(id);
                  await onConfirmPickUp(id);
                }
              }
            } catch (_) {
              // ignore per tick
            }
          };
          // Run scanning every 250ms
          intervalId = window.setInterval(scan, 250);
        } else {
          // ZXing fallback
          zxingReader = new BrowserMultiFormatReader();
          const runZxing = async () => {
            try {
              const result = await zxingReader.decodeOnceFromVideoElement(videoRef.current);
              if (result?.text) {
                const id = extractParcelId(result.text) || result.text;
                if (id) {
                  setDetectedId(id);
                  await onConfirmPickUp(id);
                }
              }
            } catch (_) {
              // keep trying
            }
          };
          runZxing();
        }
      } catch (e) {
        setError('Failed to access camera. Paste the QR link below.');
      }
    };
    init();
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      try { zxingReader?.reset(); } catch (_) {}
      stopStream();
    };
  }, [stopStream]);

  const extractParcelId = (text) => {
    try {
      // Accept both customer/parcel/qr/:id and parcel/qr/:id shapes
      const match = text.match(/\/(?:customer\/)?parcel\/qr\/([^/?#]+)/i);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  };

  const onManualSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = String(form.get('qr') || '').trim();
    const id = extractParcelId(input) || input; // allow pasting just the id
    if (!id) {
      setError('Invalid QR content.');
      return;
    }
    await onConfirmPickUp(id);
  };

  const onConfirmPickUp = useCallback(async (parcelId) => {
    if (processing) return;
    setProcessing(true);
    setError('');
    try {
      await apiFetch(`/parcels/${parcelId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'Picked Up' })
      });
      stopStream();
      navigate(`/parcel/${parcelId}`);
    } catch (_) {
      setError('Failed to update status to Picked Up.');
    } finally {
      setProcessing(false);
    }
  }, [navigate, processing, stopStream]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-[9999999] shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pick Up Scan</h1>
                <p className="text-gray-600">Scan customer QR to confirm pickup</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Camera Scanner</h2>
              </div>
              <div className="p-6">
                <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                </div>
                {detectedId && (
                  <div className="mt-3 text-sm text-gray-700">
                    Detected Parcel ID: <span className="font-semibold">{detectedId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Manual Fallback</h3>
                <p className="text-sm text-gray-600 mt-1">If camera scan fails, paste the QR link or Parcel ID.</p>
              </div>
              <form onSubmit={onManualSubmit} className="p-6 space-y-3">
                <input name="qr" className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Paste QR link or Parcel ID" />
                <button disabled={processing} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {processing ? 'Updating…' : 'Confirm Pick Up'}
                </button>
                {error && <div className="text-sm text-red-600">{error}</div>}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}



