import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, message, DatePicker, Card } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { chargingCostService, ChargingCost, ChargingCostCreate } from "./services/chargingCostService";
import dayjs from "dayjs";

const Settings: React.FC = () => {
  const [chargingCosts, setChargingCosts] = useState<ChargingCost[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchChargingCosts();
  }, []);

  const fetchChargingCosts = async () => {
    setLoading(true);
    try {
      const data = await chargingCostService.getAllChargingCosts();
      setChargingCosts(data);
    } catch (error) {
      console.error("Failed to load charging costs:", error);
      message.error("Failed to load charging costs.");
    }
    setLoading(false);
  };

  const showModal = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      console.log("Form values:", values);
      console.log("kwh_price type:", typeof values.kwh_price);
      console.log("kwh_price value:", values.kwh_price);
      
      const newCost: ChargingCostCreate = {
        kwh_price: parseFloat(values.kwh_price),
        start_date: values.start_date.format('YYYY-MM-DD'),
      };

      console.log("Sending to API:", newCost);
      await chargingCostService.createChargingCost(newCost);
      message.success("Charging cost added successfully!");
      setIsModalOpen(false);
      fetchChargingCosts();
    } catch (error) {
      console.error("Error creating charging cost:", error);
      message.error(error instanceof Error ? error.message : "An error occurred while creating charging cost.");
    }
  };

  const columns = [
    {
      title: "kWh Price (€)",
      dataIndex: "kwh_price",
      key: "kwh_price",
      render: (price: number) => `€${price.toFixed(4)}`,
    },
    {
      title: "End Date",
      dataIndex: "end_date",
      key: "end_date",
      render: (endDate: string | null) => {
        if (!endDate) {
          return <span style={{ color: 'green', fontWeight: 'bold' }}>Active</span>;
        }
        return dayjs(endDate).format('YYYY-MM-DD');
      },
    },
    {
      title: "Created",
      dataIndex: "created",
      key: "created",
      render: (created: string) => dayjs(created).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <Card title="Charging Costs" style={{ marginBottom: 16 }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={showModal}
          style={{ marginBottom: 16 }}
          size={isMobile ? "small" : "middle"}
        >
          {isMobile ? "Add Price" : "Add New Price Record"}
        </Button>
        
        <Table 
          columns={columns} 
          dataSource={chargingCosts} 
          loading={loading} 
          rowKey="id"
          pagination={{ 
            pageSize: isMobile ? 5 : 10,
            size: isMobile ? "small" : "default"
          }}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: isMobile ? 600 : undefined }}
        />
      </Card>

      <Modal 
        title="Add New Charging Cost" 
        open={isModalOpen} 
        onOk={handleOk} 
        onCancel={() => setIsModalOpen(false)}
        okText="Add Cost"
        cancelText="Cancel"
        width={isMobile ? "90%" : 520}
      >
        <Form form={form} layout="vertical">
          <Form.Item 
            name="kwh_price" 
            label="kWh Price (€)" 
            rules={[
              { required: true, message: "Please enter kWh price" },
              {
                validator: (_, value) => {
                  if (value && value > 0) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Price must be positive'));
                }
              }
            ]}
          >
            <Input type="number" step="0.0001" placeholder="0.2500" />
          </Form.Item>
          
          <Form.Item 
            name="start_date" 
            label="Start Date" 
            rules={[
              { required: true, message: "Please select start date" }
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              placeholder="Select start date"
            />
          </Form.Item>
          <div style={{ color: '#666', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
            Note: Start date cannot be earlier than the last known end date (if any).
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;
