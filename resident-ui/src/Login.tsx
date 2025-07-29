import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Button, Result } from "antd";
import { API_BASE_URL } from "./config";

export default function Login() {
  console.log("Login component rendering...");
  const [message, setMessage] = useState("Logging in...");
  const [status, setStatus] = useState("loading");
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
        setMessage(data.message);
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
      })
      .catch((err) => {
        setMessage(err.message);
        setStatus("error");
      });
  }, [searchParams, navigate]);

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
              <Button type="primary" onClick={() => navigate("/")}>
                Go to Home
              </Button>
            )
          }
        />
      </Card>
    </div>
  );
} 