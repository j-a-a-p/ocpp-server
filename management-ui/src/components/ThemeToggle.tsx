import { Segmented } from "antd";
import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useThemeMode, type ThemePreference } from "../theme/themeContext";

const ThemeToggle: React.FC = () => {
  const { preference, setPreference } = useThemeMode();

  return (
    <Segmented<ThemePreference>
      size="small"
      value={preference}
      onChange={setPreference}
      options={[
        { value: "light", icon: <SunOutlined />, title: "Light" },
        { value: "system", icon: <DesktopOutlined />, title: "Follow system" },
        { value: "dark", icon: <MoonOutlined />, title: "Dark" },
      ]}
    />
  );
};

export default ThemeToggle;
