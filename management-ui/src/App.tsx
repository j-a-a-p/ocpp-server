import { lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./Login";
import AppLayout from "./AppLayout";
import Dashboard from "./Dashboard";

const Residents = lazy(() => import("./Residents"));
const Charges = lazy(() => import("./Charges"));
const PowerLogs = lazy(() => import("./PowerLogs"));
const Profiles = lazy(() => import("./Profiles"));
const Settings = lazy(() => import("./Settings"));

function App() {
  return (
    <AuthProvider>
      <Router basename="/management-ui">
        <Routes>
          <Route element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="residents" element={<Residents />} />
            <Route path="charges" element={<Charges />} />
            <Route path="power-logs" element={<PowerLogs />} />
            <Route path="profiles" element={<Profiles />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
