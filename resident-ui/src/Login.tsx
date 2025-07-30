import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Button, Result } from "antd";
import { API_BASE_URL } from "./config";
import { useAuth } from "./contexts/AuthContext";

export default function Login() {
  console.log("Login component rendering...");
  const [message, setMessage] = useState("Checking authentication...");
  const [status, setStatus] = useState("loading");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth, isAuthenticated } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    
    // First check if user is already authenticated
    const checkIfAlreadyAuthenticated = async () => {
      await checkAuth();
      
      if (isAuthenticated) {
        setMessage("You are already logged in. Redirecting to the app...");
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
        return;
      }
      
      // If not authenticated, proceed with login token processing
      if (!token) {
        setMessage("Invalid login link.");
        setStatus("error");
        return;
      }

      setMessage("Logging in...");
      
      fetch(`${API_BASE_URL}/auth/login/${token}`, {
        method: "POST",
        credentials: "include",
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.detail || "Login failed");
          }
          setMessage(data.message);
          setStatus("success");
          
          // Update the authentication state immediately
          await checkAuth();
          
          setTimeout(() => navigate("/"), 2000);
        })
        .catch((err) => {
          setMessage(err.message);
          setStatus("error");
        });
    };

    checkIfAlreadyAuthenticated();
  }, [searchParams, navigate, checkAuth, isAuthenticated]);

  const handleRetryLogin = () => {
    // Clear the current URL parameters and redirect to home to trigger the auth popup
    navigate("/", { replace: true });
  };

  const handleGoToHome = () => {
    // Navigate to home without replacing, so user can see the auth popup
    navigate("/");
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f5f5f5",
      }}
    >
      <Card style={{ width: 400, textAlign: "center" }}>
        <Result
          status={status === "success" ? "success" : status === "error" ? "error" : "info"}
          title={
            status === "success"
              ? "Login Successful"
              : status === "error"
              ? "Login Failed"
              : "Logging In..."
          }
          subTitle={message}
          extra={
            status === "error" && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <Button onClick={handleRetryLogin}>
                  Try Again
                </Button>
                <Button type="primary" onClick={handleGoToHome}>
                  Request New Login Link
                </Button>
              </div>
            )
          }
        />
      </Card>
    </div>
  );
} 