import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Result } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { useAuth } from "./contexts/AuthContext";
import AuthLayout from "./components/AuthLayout";

// The page behind the activation link. Activating also signs the resident in, so go straight to the app.
export default function Activate() {
  const { message: toast } = App.useApp();
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  // An activation link works once, so never use it twice (React runs effects twice in development).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid activation link.");
      return;
    }

    fetch(`${API_BASE_URL}/residents/activate/${token}`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Activation failed");
        }
        // Without this the app still believes nobody is signed in and asks for the email address again.
        await checkAuth();
        toast.success("Account activated");
        // A manager who cannot charge has nothing to do here: the management portal is where they go.
        const roles: string[] = data.roles ?? ["resident"];
        if (roles.includes("manager") && !roles.includes("resident")) {
          window.location.assign("/management-ui/");
          return;
        }
        navigate("/", { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [searchParams, navigate, checkAuth, toast]);

  if (error) {
    return (
      <AuthLayout>
        <Result
          status="error"
          title="Activation failed"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate("/")}>
              Go home
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Result icon={<LoadingOutlined />} title="Activating your account..." />
    </AuthLayout>
  );
}
