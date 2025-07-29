import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "antd";
import { Button } from "antd";

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

    fetch(`http://localhost:8000/residents/activate/${token}`, {
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
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <Card className="w-96 p-6 shadow-lg bg-white" title="Account Activation">
        <p className={status === "error" ? "text-red-500" : "text-gray-700"}>{message}</p>
        {status === "error" && (
          <Button className="mt-4" type="primary" onClick={() => navigate("/")}>Go Home</Button>
        )}
      </Card>
    </div>
  );
}
