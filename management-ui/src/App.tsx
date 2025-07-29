import { useEffect, useState } from "react";
import { Layout, Menu, Table, Button, Modal, Form, Input, message } from "antd";
import { UserOutlined, HomeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Header, Content, Sider } = Layout;

const App: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<string>("home");
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingOwner, setEditingOwner] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (selectedMenu === "residents") fetchOwners();
  }, [selectedMenu]);

  const fetchOwners = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/owners/`);
      const data = await response.json();
      setOwners(data);
    } catch (error) {
      message.error("Failed to load owners.");
    }
    setLoading(false);
  };

  const showModal = (owner = null) => {
    setEditingOwner(owner);
    form.setFieldsValue(owner || { full_name: "", email: "", reference: "" });
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const method = editingOwner ? "PUT" : "POST";
      const url = editingOwner ? `${API_BASE_URL}/owners/${editingOwner.id}` : `${API_BASE_URL}/owners/`;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        message.success(editingOwner ? "Resident updated!" : "Resident added!");
        setIsModalOpen(false);
        fetchOwners();
      } else {
        message.error("Failed to save resident.");
      }
    } catch (error) {
      message.error("An error occurred while saving resident.");
    }
  };

  const handleAddCard = async (ownerId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/cards/add_card/${ownerId}`, {
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

  const handleDeleteOwner = async (ownerId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/owners/${ownerId}`, {
        method: "DELETE",
      });
  
      if (response.status === 204) {
        message.success("Owner deleted successfully!");
        fetchOwners(); // Refresh the list
      } else {
        message.error("Failed to delete owner.");
      }
    } catch (error) {
      message.error("An error occurred while deleting the owner.");
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
            onClick={() => handleDeleteOwner(record.id)}
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
              <Button type="primary" onClick={() => showModal()}>Add Owner</Button>
              <Table columns={columns} dataSource={owners} loading={loading} rowKey="id" style={{ marginTop: 16 }} />
              <Modal title={editingOwner ? "Edit Owner" : "Add Owner"} open={isModalOpen} onOk={handleOk} onCancel={() => setIsModalOpen(false)}>
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
