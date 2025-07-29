import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "antd";
import { Button } from "antd";
import { API_BASE_URL } from "./config";

export default function Activate() {
  console.log("Activate component rendering...");
  const [message, setMessage] = useState("Activating account...");
  const [status, setStatus] = useState("loading");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setMessage("Invalid activation link.");
      setStatus("error");
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
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#f5f5f5"
    }}>
      <Card 
        style={{
          width: "400px",
          padding: "24px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          backgroundColor: "#fff"
        }} 
        title="Account Activation"
      >
        <p style={{
          color: status === "error" ? "#ff4d4f" : "#262626",
          marginBottom: status === "error" ? "16px" : "0"
        }}>
          {message}
        </p>
        {status === "error" && (
          <Button 
            type="primary" 
            onClick={() => navigate("/")}
            style={{ marginTop: "16px" }}
          >
            Go Home
          </Button>
        )}
      </Card>
    </div>
  );
}
