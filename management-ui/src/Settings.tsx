import { useEffect, useState } from "react";
import { App, Button, Card, DatePicker, Form, InputNumber, Modal, Table, Tag, Typography } from "antd";
import { EuroOutlined, PlusOutlined } from "@ant-design/icons";
import { chargingCostService, ChargingCost, ChargingCostCreate } from "./services/chargingCostService";
import dayjs from "dayjs";
import { parseUtc } from "./utils/dates";

const Settings: React.FC = () => {
  const { message } = App.useApp();
  const [chargingCosts, setChargingCosts] = useState<ChargingCost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [form] = Form.useForm();

  const fetchChargingCosts = async () => {
    try {
      setChargingCosts(await chargingCostService.getAllChargingCosts());
    } catch (error) {
      console.error("Failed to load charging costs:", error);
      message.error("Failed to load charging costs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChargingCosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showModal = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const newCost: ChargingCostCreate = {
        kwh_price: Number(values.kwh_price),
        start_date: values.start_date.format("YYYY-MM-DD"),
      };
      await chargingCostService.createChargingCost(newCost);
      message.success("Charging cost added");
      setIsModalOpen(false);
      fetchChargingCosts();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      console.error("Error creating charging cost:", error);
      message.error(error instanceof Error ? error.message : "An error occurred while creating charging cost.");
    }
  };

  const columns = [
    {
      title: "Price per kWh",
      dataIndex: "kwh_price",
      key: "kwh_price",
      render: (price: number) => <Typography.Text strong>€{price.toFixed(4)}</Typography.Text>,
    },
    {
      title: "Valid until",
      dataIndex: "end_date",
      key: "end_date",
      render: (endDate: string | null) =>
        endDate ? dayjs(endDate).format("YYYY-MM-DD") : <Tag color="success">Current</Tag>,
    },
    {
      title: "Created",
      dataIndex: "created",
      key: "created",
      render: (created: string) => dayjs(parseUtc(created)).format("YYYY-MM-DD HH:mm"),
    },
  ];

  return (
    <Card
      title={
        <span>
          <EuroOutlined style={{ marginRight: 8 }} />
          Charging costs
        </span>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={showModal}>
          New price
        </Button>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        columns={columns}
        dataSource={chargingCosts}
        loading={loading}
        rowKey="id"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 10, hideOnSinglePage: true, style: { padding: "0 16px" } }}
      />

      <Modal
        title="New charging cost"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="Add price"
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="kwh_price"
            label="Price per kWh"
            rules={[
              { required: true, message: "Please enter kWh price" },
              {
                validator: (_, value) => {
                  if (value && value > 0) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Price must be positive"));
                },
              },
            ]}
          >
            <InputNumber prefix="€" min={0} step={0.0001} precision={4} placeholder="0.2500" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="start_date"
            label="Start date"
            rules={[{ required: true, message: "Please select start date" }]}
            extra="The start date cannot be earlier than the last known end date (if any)."
          >
            <DatePicker style={{ width: "100%" }} placeholder="Select start date" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Settings;
