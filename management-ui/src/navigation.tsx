import type { ReactNode } from "react";
import {
  BarChartOutlined,
  DashboardOutlined,
  ProfileOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from "@ant-design/icons";

export interface NavItem {
  path: string;
  label: string;
  title: string;
  icon: ReactNode;
}

export const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", title: "Dashboard", icon: <DashboardOutlined /> },
  { path: "/residents", label: "Residents", title: "Residents", icon: <TeamOutlined /> },
  { path: "/charges", label: "Charges", title: "Charge reports", icon: <ThunderboltOutlined /> },
  { path: "/power-logs", label: "Power logs", title: "Power log analytics", icon: <BarChartOutlined /> },
  { path: "/stations", label: "Stations", title: "Charging stations", icon: <WifiOutlined /> },
  { path: "/profiles", label: "Profiles", title: "Charging profiles", icon: <ProfileOutlined /> },
  { path: "/settings", label: "Settings", title: "Settings", icon: <SettingOutlined /> },
];
