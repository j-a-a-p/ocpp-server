import type { ReactNode } from "react";
import { Card, Flex, Typography } from "antd";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

const AuthLayout: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="auth-page">
    <Flex vertical align="center" gap={12}>
      <BrandMark size={52} />
      <Typography.Title level={3} style={{ margin: 0 }}>
        Resident Portal
      </Typography.Title>
    </Flex>
    <Card style={{ width: "100%", maxWidth: 420 }}>{children}</Card>
    <ThemeToggle />
  </div>
);

export default AuthLayout;
