import { useState } from "react";
import { App, Button, Grid } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";

const LogoutButton: React.FC = () => {
  const { message } = App.useApp();
  const { logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await logout();
    } catch (error) {
      console.error("Error logging out:", error);
      message.error("Failed to log out");
      setLoading(false);
    }
  };

  return (
    <Button type="text" icon={<LogoutOutlined />} loading={loading} onClick={handleClick} aria-label="Log out">
      {screens.sm !== false && "Log out"}
    </Button>
  );
};

export default LogoutButton;
