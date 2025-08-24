import React, { useState } from 'react';
import { Menu, Button, Drawer } from 'antd';
import { MenuOutlined, HomeOutlined, UserOutlined, ThunderboltOutlined, BarChartOutlined, SettingOutlined, ProfileOutlined } from '@ant-design/icons';

interface MobileMenuProps {
  selectedMenu: string;
  onMenuSelect: (key: string) => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ selectedMenu, onMenuSelect }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  const menuItems = [
    { key: "home", icon: <HomeOutlined />, label: "Home" }, 
    { key: "residents", icon: <UserOutlined />, label: "Residents" },
    { key: "charges", icon: <ThunderboltOutlined />, label: "Charges" },
    { key: "powerlogs", icon: <BarChartOutlined />, label: "PowerLogs" },
    { key: "profiles", icon: <ProfileOutlined />, label: "Profiles" },
    { key: "settings", icon: <SettingOutlined />, label: "Settings" }
  ];

  const handleMenuClick = (key: string) => {
    onMenuSelect(key);
    setDrawerVisible(false);
  };

  return (
    <>
      <Button
        type="text"
        icon={<MenuOutlined />}
        onClick={() => setDrawerVisible(true)}
        style={{
          fontSize: '18px',
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      <Drawer
        title="Menu"
        placement="left"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={250}
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedMenu]}
          onClick={({ key }) => handleMenuClick(key)}
          items={menuItems}
          style={{ border: 'none' }}
        />
      </Drawer>
    </>
  );
};

export default MobileMenu;
