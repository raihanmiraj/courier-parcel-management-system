import AdminPanel from '../components/AdminPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function Navbar({ onLogout, user }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">C</div>
          <span className="font-semibold">Courier Manager</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">{user?.name} <span className="text-gray-400">• {user?.role}</span></div>
          <button onClick={onLogout} className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">Logout</button>
        </div>
      </div>
    </header>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  return (
    <>
      <Navbar user={user} onLogout={logout} />
      <main className="container py-6">
        <AdminPanel />
      </main>
    </>
  );
}
