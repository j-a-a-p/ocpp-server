import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { submitEmail } from '../services/authService';

interface AuthPopupProps {
  visible: boolean;
  onClose: () => void;
}

const AuthPopup: React.FC<AuthPopupProps> = ({ visible, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { email: string }) => {
    setLoading(true);
    
    try {
      const response = await submitEmail(values.email);
      
      if (response.success) {
        message.success(response.message || 'Email submitted successfully!');
        form.resetFields();
        // Don't call onSuccess() here since the user hasn't actually logged in yet
        // Just close the popup and let them check their email
        onClose();
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
      title={
        <div style={{ textAlign: 'center' }}>
          <MailOutlined style={{ fontSize: '24px', color: '#1890ff', marginRight: '8px' }} />
          Authentication Required
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      footer={null}
      centered
      closable={false}
      maskClosable={false}
      width={400}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          Please enter your email address to access the resident portal.
        </p>
      </div>

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
            placeholder="Enter your email address"
            size="large"
            prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
            autoFocus
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={loading}
            style={{ width: '100%' }}
          >
            Submit Email
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
          You will receive an email with further instructions.
        </p>
      </div>
    </Modal>
  );
};

export default AuthPopup; 