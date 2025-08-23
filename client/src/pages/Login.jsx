import { useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import { Navigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function LoginPage() {
  const { login, token, user } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(form) });
      login(res.token, res.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (token && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm font-medium">
            <button onClick={() => setMode('login')} className={`rounded-md px-3 py-2 ${mode==='login' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>{t.login}</button>
            <button onClick={() => setMode('register')} className={`rounded-md px-3 py-2 ${mode==='register' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>{t.register}</button>
          </div>
          <LanguageSwitcher />
        </div>
        <form onSubmit={submit} className="grid gap-4">
          {mode === 'register' && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">{t.fullName}</label>
              <input className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder={t.johnDoe} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
            </div>
          )}
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.email}</label>
            <input className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder={t.emailPlaceholder} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t.password}</label>
            <input type="password" className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder={t.passwordPlaceholder} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} />
          </div>
          {mode === 'register' && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">{t.role}</label>
              <select className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                <option value="customer">{t.customer}</option>
                <option value="agent">{t.deliveryAgent}</option>
              </select>
            </div>
          )}
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {loading ? t.pleaseWait : (mode==='login' ? t.login : t.createAccount)}
          </button>
        </form>
      </div>
    </div>
  );
}
