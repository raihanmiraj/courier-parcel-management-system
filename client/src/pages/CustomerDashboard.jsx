import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { Link } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

function Navbar({ onLogout, user }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);

  return (
    <header className="sticky top-0 z-[9999999] w-full border-b bg-white/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">C</div>
          <span className="font-semibold">{t.courierManager}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">{user?.name} <span className="text-gray-400">• {user?.role}</span></div>
          <LanguageSwitcher />
          <button onClick={onLogout} className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">{t.logout}</button>
        </div>
      </div>
    </header>
  );
}

function BookingForm({ onCreated }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  const [form, setForm] = useState({
    pickupAddress: '',
    deliveryAddress: '',
    parcelSize: 'Small',
    parcelType: 'Standard',
    paymentType: 'Prepaid',
    codAmount: 0,
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const p = await apiFetch('/parcels', { method: 'POST', body: JSON.stringify(form) });
      onCreated(p);
      setForm({ pickupAddress: '', deliveryAddress: '', parcelSize: 'Small', parcelType: 'Standard', paymentType: 'Prepaid', codAmount: 0, notes: '' });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{t.bookParcel}</h3>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t.pickupAddress}</label>
          <input className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.pickupAddress} onChange={e => setForm({ ...form, pickupAddress: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t.deliveryAddress}</label>
          <input className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.deliveryAddress} onChange={e => setForm({ ...form, deliveryAddress: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.parcelSize}</label>
            <select className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.parcelSize} onChange={e => setForm({ ...form, parcelSize: e.target.value })}>
              <option>{t.small}</option>
              <option>{t.medium}</option>
              <option>{t.large}</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.parcelType}</label>
            <select className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.parcelType} onChange={e => setForm({ ...form, parcelType: e.target.value })}>
              <option>{t.standard}</option>
              <option>{t.document}</option>
              <option>{t.fragile}</option>
              <option>{t.perishable}</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.paymentType}</label>
            <select className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.paymentType} onChange={e => setForm({ ...form, paymentType: e.target.value })}>
              <option>{t.prepaid}</option>
              <option>{t.cod}</option>
            </select>
          </div>
        </div>
        {form.paymentType === 'COD' && (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.codAmount}</label>
            <input type="number" className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.codAmount} onChange={e => setForm({ ...form, codAmount: Number(e.target.value) })} />
          </div>
        )}
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t.notes}</label>
          <input className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div>
          <button disabled={loading} className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50">{loading ? t.booking : t.bookParcelButton}</button>
        </div>
      </form>
    </div>
  );
}

function ParcelTable({ parcels }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{t.parcels}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 pr-4">{t.tracking}</th>
              <th className="py-2 pr-4">{t.status}</th>
              <th className="py-2 pr-4">{t.payment}</th>
              <th className="py-2 pr-4">{t.created}</th>
              <th className="py-2 pr-4">{t.actions}</th>

            </tr>
          </thead>
          <tbody>
            {parcels.map((p) => (
              <tr key={p._id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{p.trackingCode}</td>
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{p.status}</span>
                </td>
                <td className="py-2 pr-4">{p.paymentType}{p.paymentType === 'COD' ? ` (BDT ${p.codAmount})` : ''}</td>
                <td className="py-2 pr-4">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-4 flex gap-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/customer/parcel/${p._id}`}
                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      {t.view}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/customer/parcel/qr/${p._id}`}
                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      {t.qrCode}
                    </Link>
                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CustomerDashboard() {
  const { user, logout } = useAuth();
  const [parcels, setParcels] = useState([]);

  useEffect(() => {
    apiFetch('/parcels').then(setParcels).catch(() => { });
  }, []);

  return (
    <>
      <Navbar user={user} onLogout={logout} />
      <main className="container py-6">
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <BookingForm onCreated={(p) => setParcels(x => [p, ...x])} />
          </div>
          <div className="lg:col-span-2">
            <ParcelTable parcels={parcels} />
          </div>
        </div>
      </main>
    </>
  );
}
