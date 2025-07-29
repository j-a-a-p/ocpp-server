// Ensure the router setup in App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Activate from "./Activate";
import Login from "./Login";
import Home from "./Home";

function App() {
  console.log("App component rendering...");
  
  return (
    <AuthProvider>
      <Router basename="/resident-ui">
        <Routes>
          <Route path="/" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />
          <Route path="/activate" element={<Activate />} />
          <Route path="/login" element={<Login />} />
          {/* Catch all other routes and redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;