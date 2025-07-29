import { useEffect, useState } from "react";
import { Layout, Menu, Table, Button, Modal, Form, Input, message } from "antd";
import { UserOutlined, HomeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Header, Content, Sider } = Layout;

interface Resident {
  id: number;
  full_name: string;
  email: string;
  reference: string;
  status: string;
}

const App: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<string>("home");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
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
      console.error("Failed to load residents:", error);
      message.error("Failed to load residents.");
    }
    setLoading(false);
  };

  const showModal = (resident: Resident | null = null) => {
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
        // Try to get error details from response
        try {
          const errorData = await response.json();
          message.error(errorData.detail || "Failed to save resident.");
        } catch {
          message.error("Failed to save resident.");
        }
      }
    } catch (error) {
      console.error("Error saving resident:", error);
      message.error("An error occurred while saving resident.");
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
      render: (_: unknown, record: Resident) => (
        <>
          <Button onClick={() => showModal(record)}>Edit</Button>
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
