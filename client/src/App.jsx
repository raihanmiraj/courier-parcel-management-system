import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { ProtectedRoute, RoleRoute, GuestRoute, AdminRoute, DeliveryAgentRoute, CustomerRoute } from './routes/ProtectedRoute.jsx';
import LoginPage from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CustomerDashboard from './pages/CustomerDashboard.jsx';
import AgentDashboard from './pages/AgentDashboard.jsx';
import TrackParcel from './pages/TrackParcel.jsx';
import PublicTrack from './pages/PublicTrack.jsx';
import MapJavascriptRoute from './pages/MapJavascriptRoute.jsx';
import PushInMap from './pages/PushInMap.jsx';
import PushCurrentLocation from './pages/PushCurrentLocation.jsx';
import ParcelRoute from './pages/ParcelRoute.jsx';
import ParcelDetailView from './pages/ParcelDetailView.jsx';
import CustomerParcelDetail from './pages/CustomerParcelDetail.jsx';

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'agent') return <Navigate to="/agent" replace />;
  return <Navigate to="/app" replace />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route path="/test" element={<MapJavascriptRoute />} />
            <Route path="/test/push" element={<PushInMap />} />
            <Route path="/test/current" element={<PushCurrentLocation />} />
            <Route path="/track/:trackingCode" element={<PublicTrack />} />
            <Route path="/parcel/:id/route" element={<ParcelRoute />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
              <Route element={<DeliveryAgentRoute />}>
                <Route path="/agent" element={<AgentDashboard />} />
                <Route path="/parcel/:id" element={<ParcelDetailView />} />
              </Route>
              <Route element={<CustomerRoute />}>
                <Route path="/app" element={<CustomerDashboard />} />
                <Route path="/customer/parcel/:id" element={<CustomerParcelDetail />} />
              </Route>
              <Route path="/track/:id" element={<TrackParcel />} />
            </Route>

            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
