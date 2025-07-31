import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./Login";
import ManagementDashboard from "./ManagementDashboard";

function App() {
  console.log("App component rendering...");
  
  return (
    <AuthProvider>
      <Router basename="/management-ui">
        <Routes>
          <Route path="/" element={
            <ProtectedRoute>
              <ManagementDashboard />
            </ProtectedRoute>
          } />
          <Route path="/login" element={<Login />} />
          {/* Catch all other routes and redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
