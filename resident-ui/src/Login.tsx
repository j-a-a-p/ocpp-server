import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Result } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { useAuth } from "./contexts/AuthContext";
import AuthLayout from "./components/AuthLayout";

export default function Login() {
  const [message, setMessage] = useState("Checking authentication...");
  const [status, setStatus] = useState("loading");
  const [serverAvailable, setServerAvailable] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth, isAuthenticated } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    
    const checkIfAlreadyAuthenticated = async () => {
      await checkAuth();
      
      if (isAuthenticated) {
        setMessage("You are already logged in. Redirecting to the app...");
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
        return;
      }
      
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
          
          await checkAuth();
          
          setTimeout(() => navigate("/"), 2000);
        })
        .catch((err) => {
          console.error('Login error:', err);
          if (err.message.includes('fetch')) {
            setServerAvailable(false);
            setMessage("Server is currently unavailable. Please try again later.");
          } else {
            setMessage(err.message);
          }
          setStatus("error");
        });
    };

    checkIfAlreadyAuthenticated();
  }, [searchParams, navigate, checkAuth, isAuthenticated]);

  if (!serverAvailable) {
    return (
      <AuthLayout>
        <Result
          status="warning"
          title="Server unavailable"
          subTitle="The server is currently unavailable. Please check your connection and try again."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Retry connection
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Result
        status={status === "success" ? "success" : status === "error" ? "error" : "info"}
        icon={status === "loading" ? <LoadingOutlined /> : undefined}
        title={status === "success" ? "Login successful" : status === "error" ? "Login failed" : "Logging in..."}
        subTitle={message}
        extra={
          status === "error" && (
            <Button type="primary" onClick={() => navigate("/")}>
              Try again
            </Button>
          )
        }
      />
    </AuthLayout>
  );
}
