import { Suspense, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Drawer, Flex, Grid, Layout, Menu, Spin, theme, Typography } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { navItems } from "./navigation";
import BrandMark from "./components/BrandMark";
import ThemeToggle from "./components/ThemeToggle";

const { Sider } = Layout;
const { Text, Title } = Typography;

const Brand: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => (
  <Flex align="center" gap={10} className="sider-brand">
    <BrandMark size={34} />
    {!collapsed && (
      <Flex vertical style={{ lineHeight: 1.25 }}>
        <Text strong style={{ fontSize: 16 }}>
          Charger
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Management
        </Text>
      </Flex>
    )}
  </Flex>
);

const AppLayout: React.FC = () => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const current = navItems.find((item) => item.path === location.pathname) ?? navItems[0];

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[current.path]}
      items={navItems.map((item) => ({ key: item.path, icon: item.icon, label: item.label }))}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 0, background: "transparent", padding: "0 8px" }}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      {!isMobile && (
        <Sider
          className="app-sider"
          theme="light"
          width={232}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ borderInlineEnd: `1px solid ${token.colorBorderSecondary}` }}
        >
          <Brand collapsed={collapsed} />
          {menu}
        </Sider>
      )}
      <Layout style={{ background: "transparent" }}>
        <header className="app-header" style={{ padding: isMobile ? "0 12px" : "0 24px" }}>
          {isMobile && <Button type="text" icon={<MenuOutlined />} aria-label="Open menu" onClick={() => setDrawerOpen(true)} />}
          <Title level={4} style={{ margin: 0, flex: 1 }}>
            {current.title}
          </Title>
          <ThemeToggle />
        </header>
        <main className="page-container wide">
          <Suspense
            fallback={
              <Flex justify="center" style={{ padding: 64 }}>
                <Spin size="large" />
              </Flex>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </Layout>
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={264}
          title={<Brand />}
          styles={{ header: { padding: 0 }, body: { padding: "8px 0" } }}
        >
          {menu}
        </Drawer>
      )}
    </Layout>
  );
};

export default AppLayout;
