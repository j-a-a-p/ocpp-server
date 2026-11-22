import { useCallback, useEffect, useState } from "react";
import { App, Avatar, Button, Card, Flex, Form, Input, Modal, Table, Tag, theme, Typography } from "antd";
import { EditOutlined, UserAddOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Text } = Typography;

interface Resident {
  id: number;
  full_name: string;
  email: string;
  status: string;
}

const statusTags: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "success", label: "Active" },
  INVITED: { color: "warning", label: "Invited" },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const Residents: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [form] = Form.useForm();

  const fetchResidents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/residents/`, {
        credentials: "include",
      });
      setResidents(await response.json());
    } catch (error) {
      console.error("Failed to load residents:", error);
      message.error("Failed to load residents.");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  const showModal = (resident: Resident | null = null) => {
    setEditingResident(resident);
    form.setFieldsValue(resident || { full_name: "", email: "" });
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const method = editingResident ? "PUT" : "POST";
      const url = editingResident ? `${API_BASE_URL}/residents/${editingResident.id}` : `${API_BASE_URL}/residents/`;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });

      if (response.ok) {
        message.success(editingResident ? "Resident updated" : "Resident invited");
        setIsModalOpen(false);
        fetchResidents();
      } else {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={`${residents.length} residents`}
      extra={
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>
          Add resident
        </Button>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        dataSource={residents}
        loading={loading}
        rowKey="id"
        scroll={{ x: "max-content" }}
        pagination={{ hideOnSinglePage: true, pageSize: 20, style: { padding: "0 16px" } }}
        columns={[
          {
            title: "Resident",
            dataIndex: "full_name",
            key: "full_name",
            sorter: (a, b) => a.full_name.localeCompare(b.full_name),
            render: (name: string, record) => (
              <Flex align="center" gap={12}>
                <Avatar style={{ flex: "none", color: token.colorPrimary, background: token.colorPrimaryBg, fontWeight: 600 }}>
                  {initials(name)}
                </Avatar>
                <Flex vertical>
                  <Text strong>{name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.email}
                  </Text>
                </Flex>
              </Flex>
            ),
          },
          {
            title: "Status",
            dataIndex: "status",
            key: "status",
            filters: Object.entries(statusTags).map(([value, { label }]) => ({ text: label, value })),
            onFilter: (value, record) => record.status.toUpperCase() === value,
            render: (status: string) => {
              const tag = statusTags[status.toUpperCase()];
              return <Tag color={tag?.color}>{tag?.label ?? status}</Tag>;
            },
          },
          {
            title: "",
            key: "action",
            align: "right",
            render: (_: unknown, record) => (
              <Button type="text" icon={<EditOutlined />} onClick={() => showModal(record)}>
                Edit
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={editingResident ? "Edit resident" : "Add resident"}
        open={isModalOpen}
        onOk={handleOk}
        okText={editingResident ? "Save" : "Send invitation"}
        confirmLoading={saving}
        onCancel={() => setIsModalOpen(false)}
        forceRender
      >
        {!editingResident && (
          <Typography.Paragraph type="secondary">
            The resident receives an email with a link to activate their account.
          </Typography.Paragraph>
        )}
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label="Full name" rules={[{ required: true, message: "Please enter full name" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Please enter a valid email" }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Residents;
