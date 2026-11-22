import { Flex, Typography } from "antd";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";

const { Text } = Typography;

const AppHeader: React.FC = () => (
  <header className="app-header">
    <div className="app-header-inner">
      <BrandMark />
      <Flex vertical style={{ flex: 1, lineHeight: 1.25 }}>
        <Text strong style={{ fontSize: 16 }}>
          Charger
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Resident portal
        </Text>
      </Flex>
      <ThemeToggle />
    </div>
  </header>
);

export default AppHeader;
