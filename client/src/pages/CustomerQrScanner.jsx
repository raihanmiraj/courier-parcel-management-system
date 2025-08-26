import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';

export default function CustomerQrScanner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const qrValue = useMemo(() => {
    const base = window.location.origin;
    return `${base}/customer/parcel/qr/${id}`;
  }, [id]);

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      setLoading(true);
      try {
        const p = await apiFetch(`/parcels/${id}`);
        if (!canceled) {
          // Guard: ensure the logged in customer owns this parcel (if customer info exists)
          if (p?.customer && user?._id && p.customer._id && p.customer._id !== user._id) {
            setError('You do not have access to this parcel.');
          } else {
            setParcel(p);
          }
        }
      } catch (e) {
        if (!canceled) setError('Failed to load parcel.');
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    load();
    return () => {
      canceled = true;
    };
  }, [id, user?._id]);

  useEffect(() => {
    let isMounted = true;
    const generate = async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        const url = await QRCode.toDataURL(qrValue, {
          errorCorrectionLevel: 'M',
          margin: 1,
          scale: 8,
          color: {
            dark: '#111827',
            light: '#ffffffff'
          }
        });
        if (isMounted) setQrDataUrl(url);
      } catch (_) {
        if (isMounted) setError('Failed to generate QR code.');
      }
    };
    generate();
    return () => {
      isMounted = false;
    };
  }, [qrValue]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t.loadingQr}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">⚠️</div>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => navigate('/app')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-[9999999] shadow-sm print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t.parcelQr}</h1>
                {parcel?.trackingCode && (
                  <p className="text-gray-600">{t.trackingCode} #{parcel.trackingCode}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
              >
                🖨️ {t.print}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-md bg-white rounded-xl border shadow-sm p-6 print:shadow-none print:border-0">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">{t.showThisQr}</h2>
            <div className="p-4 bg-gray-50 rounded-lg border inline-block">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Parcel QR" className="mx-auto h-auto w-64" />
              ) : (
                <div className="w-64 h-64 grid place-items-center text-gray-400">{t.generating}</div>
              )}
            </div>
            <div className="text-sm text-gray-600 break-all">
              {qrValue}
            </div>
            {parcel && (
              <div className="mt-4 grid gap-2 text-sm text-gray-700">
                <div><span className="text-gray-500">Parcel ID:</span> <span className="font-medium">{parcel._id}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="font-medium">{parcel.status}</span></div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


