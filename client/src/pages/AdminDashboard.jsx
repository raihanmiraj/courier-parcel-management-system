import AdminPanel from '../components/AdminPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getTranslations } from '../translations';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

function Navbar({ onLogout, user }) {
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
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

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { currentLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);
  
  return (
    <>
      <Navbar user={user} onLogout={logout} />
      <main className="container py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/admin/tracking'}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                🚚 {t.trackAgents}
              </button>
            </div>
          </div>
        </div>
        <AdminPanel />
      </main>
    </>
  );
}
