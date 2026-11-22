import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Result } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import AuthLayout from "./components/AuthLayout";

export default function Activate() {
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
    <AuthLayout>
      <Result
        status={status === "success" ? "success" : status === "error" ? "error" : "info"}
        icon={status === "loading" ? <LoadingOutlined /> : undefined}
        title={status === "success" ? "Account activated" : status === "error" ? "Activation failed" : "Account activation"}
        subTitle={message}
        extra={
          status === "error" && (
            <Button type="primary" onClick={() => navigate("/")}>
              Go home
            </Button>
          )
        }
      />
    </AuthLayout>
  );
}
