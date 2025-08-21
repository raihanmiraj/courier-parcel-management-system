import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute() {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RoleRoute({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || (roles && !roles.includes(user.role))) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function roleHomePath(role) {
  if (role === 'admin') return '/admin';
  if (role === 'agent') return '/agent';
  return '/app';
}

export function GuestRoute() {
  const { user, token, loading } = useAuth();
  if (loading) return null;
  if (user && token) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <Outlet />;
}

export function AdminRoute() {
  return <RoleRoute roles={["admin"]} />;
}

export function DeliveryAgentRoute() {
  return <RoleRoute roles={["agent"]} />;
}

export function CustomerRoute() {
  return <RoleRoute roles={["customer"]} />;
}