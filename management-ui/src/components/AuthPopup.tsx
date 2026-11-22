import React, { useState } from 'react';
import { App, Button, Form, Input, Modal, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { submitEmail } from '../services/authService';

interface AuthPopupProps {
  open: boolean;
  onClose: () => void;
  onSent: (email: string) => void;
}

const AuthPopup: React.FC<AuthPopupProps> = ({ open, onClose, onSent }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { email: string }) => {
    setLoading(true);
    
    try {
      const response = await submitEmail(values.email);
      
      if (response.success) {
        form.resetFields();
        // The user is not logged in until they open the emailed link
        onSent(values.email);
      } else {
        message.error(response.message || 'Failed to submit email. Please try again.');
      }
    } catch {
      message.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Sign in to the management portal"
      open={open}
      onCancel={handleCancel}
      footer={null}
      centered
      mask={{ closable: false }}
      width={420}
    >
      <Typography.Paragraph type="secondary">
        Enter your email address and we will send you a sign-in link.
      </Typography.Paragraph>

      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        requiredMark={false}
      >
        <Form.Item
          name="email"
          rules={[
            { required: true, message: 'Please enter your email address' },
            { type: 'email', message: 'Please enter a valid email address' }
          ]}
        >
          <Input
            placeholder="you@example.com"
            size="large"
            prefix={<MailOutlined />}
            autoFocus
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" size="large" loading={loading} block>
            Email me a sign-in link
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AuthPopup;
