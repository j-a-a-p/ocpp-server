import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Result } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { useAuth } from "./contexts/AuthContext";
import AuthLayout from "./components/AuthLayout";

// The page behind the link in the email. It signs the resident in and goes straight to the app:
// there is no "logged in" page, only a toast on the page the resident lands on.
export default function Login() {
  const { message: toast } = App.useApp();
  const [error, setError] = useState<string | null>(null);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth, isAuthenticated, isLoading } = useAuth();
  // A login link works once, so never use it twice (React runs effects twice in development).
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;

    if (isAuthenticated) {
      navigate("/", { replace: true });
      return;
    }

    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid login link.");
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
        // Without this the app still believes nobody is signed in and asks for the email address again.
        await checkAuth();
        toast.success("Login successful");
        navigate("/", { replace: true });
      })
      .catch((err) => {
        console.error("Login error:", err);
        if (err.message.includes("fetch")) {
          setServerAvailable(false);
        } else {
          setError(err.message);
        }
      });
  }, [isLoading, isAuthenticated, searchParams, navigate, checkAuth, toast]);

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

  if (error) {
    return (
      <AuthLayout>
        <Result
          status="error"
          title="Login failed"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate("/")}>
              Try again
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Result icon={<LoadingOutlined />} title="Logging in..." />
    </AuthLayout>
  );
}
