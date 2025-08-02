import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Button, Result, Alert } from "antd";
import { API_BASE_URL } from "./config";

export default function Login() {
  console.log("Login component rendering...");
  const [message, setMessage] = useState("Logging in...");
  const [status, setStatus] = useState("loading");
  const [serverAvailable, setServerAvailable] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setMessage("Invalid login link.");
      setStatus("error");
      return;
    }

    fetch(`${API_BASE_URL}/auth/login/${token}`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Login failed");
        }
        setMessage(data.message || "Login successful!");
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
      })
      .catch((err) => {
        console.error('Login error:', err);
        if (err.message.includes('fetch')) {
          // Network error - server unavailable
          setServerAvailable(false);
          setMessage("Server is currently unavailable. Please try again later.");
        } else {
          setMessage(err.message);
        }
        setStatus("error");
      });
  }, [searchParams, navigate]);

  const handleRetryLogin = () => {
    // Clear the current URL parameters and redirect to home to trigger the auth popup
    window.location.href = "/";
  };

  const handleRetryConnection = () => {
    window.location.reload();
  };

  if (!serverAvailable) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#f5f5f5'
      }}>
        <Card style={{ maxWidth: '400px', textAlign: 'center' }}>
          <Alert
            message="Server Unavailable"
            description="The server is currently unavailable. Please check your connection and try again."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
          <Button type="primary" onClick={handleRetryConnection}>
            Retry Connection
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: '#f5f5f5'
    }}>
      <Card style={{ maxWidth: '400px', textAlign: 'center' }}>
        <Result
          status={status === "success" ? "success" : status === "error" ? "error" : "info"}
          title={status === "success" ? "Login Successful!" : status === "error" ? "Login Failed" : "Logging In..."}
          subTitle={message}
          extra={
            status === "error" && (
              <Button type="primary" onClick={handleRetryLogin}>
                Try Again
              </Button>
            )
          }
        />
      </Card>
    </div>
  );
} 