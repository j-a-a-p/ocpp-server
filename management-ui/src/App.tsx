import { useEffect, useState } from "react";
import { Layout, Menu, Table, Button, Modal, Form, Input, message } from "antd";
import { UserOutlined, HomeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Header, Content, Sider } = Layout;

const App: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<string>("home");
  const [residents, setResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingResident, setEditingResident] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (selectedMenu === "residents") fetchResidents();
  }, [selectedMenu]);

  const fetchResidents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/residents/`);
      const data = await response.json();
      setResidents(data);
    } catch (error) {
      message.error("Failed to load residents.");
    }
    setLoading(false);
  };

  const showModal = (resident = null) => {
    setEditingResident(resident);
    form.setFieldsValue(resident || { full_name: "", email: "", reference: "" });
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const method = editingResident ? "PUT" : "POST";
      const url = editingResident ? `${API_BASE_URL}/residents/${editingResident.id}` : `${API_BASE_URL}/residents/`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        message.success(editingResident ? "Resident updated!" : "Resident added!");
        setIsModalOpen(false);
        fetchResidents();
      } else {
        message.error("Failed to save resident.");
      }
    } catch (error) {
      message.error("An error occurred while saving resident.");
    }
  };

  const handleAddCard = async (residentId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/cards/add_card/${residentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        message.success("Card added to resident.");
      } else if (response.status === 404) {
        message.error("Could not find the card.");
      } else {
        message.error("Failed to add card.");
      }
    } catch (error) {
      message.error("An error occurred while adding card.");
    }
  };

  const handleDeleteResident = async (residentId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/residents/${residentId}`, {
        method: "DELETE",
      });
  
      if (response.status === 204) {
        message.success("Resident deleted successfully!");
        fetchResidents(); // Refresh the list
      } else {
        message.error("Failed to delete resident.");
      }
    } catch (error) {
      message.error("An error occurred while deleting the resident.");
    }
  };
  
  const columns = [
    { title: "Full Name", dataIndex: "full_name", key: "full_name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Reference", dataIndex: "reference", key: "reference" },
    { title: "Status", dataIndex: "status", key: "status" },
    {
      title: "Action",
      key: "action",
      // @ts-expect-error - Ant Design table render function types
      render: (_, record) => (
        <>
          <Button onClick={() => showModal(record)}>Edit</Button>
          <Button onClick={() => handleAddCard(record.id)} style={{ marginLeft: 8 }}>Add Card</Button>
          <Button
            onClick={() => handleDeleteResident(record.id)}
            style={{ marginLeft: 8 }}
            danger
          >Delete</Button>
        </>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          onClick={(e) => setSelectedMenu(e.key)}
          items={[{ key: "home", icon: <HomeOutlined />, label: "Home" }, { key: "residents", icon: <UserOutlined />, label: "Residents" }]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", padding: 0 }} />
        <Content style={{ margin: "16px" }}>
          {selectedMenu === "home" && <h1>Home Page</h1>}
          {selectedMenu === "residents" && (
            <>
              <Button type="primary" onClick={() => showModal()}>Add Resident</Button>
              <Table columns={columns} dataSource={residents} loading={loading} rowKey="id" style={{ marginTop: 16 }} />
              <Modal title={editingResident ? "Edit Resident" : "Add Resident"} open={isModalOpen} onOk={handleOk} onCancel={() => setIsModalOpen(false)}>
                <Form form={form} layout="vertical">
                  <Form.Item name="full_name" label="Full Name" rules={[{ required: true, message: "Please enter full name" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Please enter a valid email" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="reference" label="Reference" rules={[{ required: true, message: "Please enter reference" }]}>
                    <Input />
                  </Form.Item>
                </Form>
              </Modal>
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
