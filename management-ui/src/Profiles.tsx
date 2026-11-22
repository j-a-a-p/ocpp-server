import React, { useEffect, useState } from 'react';
import { App, Button, Card, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { chargingProfileService, ChargingProfile, ProfileType } from './services/chargingProfileService';
import { parseUtc } from './utils/dates';
import { formatNumber } from './utils/format';

const Profiles: React.FC = () => {
  const { message } = App.useApp();
  const [profiles, setProfiles] = useState<ChargingProfile[]>([]);
  const [profileTypes, setProfileTypes] = useState<ProfileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ChargingProfile | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form] = Form.useForm();

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const data = await chargingProfileService.getProfiles();
      setProfiles(data);
    } catch (error) {
      message.error('Failed to load profiles');
      console.error('Error fetching profiles:', error);
    }
    setLoading(false);
  };

  const fetchProfileTypes = async () => {
    try {
      const data = await chargingProfileService.getAvailableProfileTypes();
      setProfileTypes(data.profile_types);
    } catch (error) {
      message.error('Failed to load profile types');
      console.error('Error fetching profile types:', error);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchProfileTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showModal = (profile: ChargingProfile | null = null) => {
    setEditingProfile(profile);
    if (profile) {
      form.setFieldsValue({
        name: profile.name,
        profile_type: profile.profile_type,
        status: profile.status,
        max_current: profile.max_current,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingProfile) {
        await chargingProfileService.updateProfile(editingProfile.id, values);
        message.success('Profile updated successfully!');
      } else {
        await chargingProfileService.createProfile(values);
        message.success('Profile created successfully!');
      }
      
      setModalVisible(false);
      fetchProfiles();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save profile');
    }
  };

  const handleInactivate = async (id: number) => {
    try {
      await chargingProfileService.inactivateProfile(id);
      message.success('Profile inactivated successfully!');
      fetchProfiles();
    } catch {
      message.error('Failed to inactivate profile');
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      await chargingProfileService.reactivateProfile(id);
      message.success('Profile reactivated successfully!');
      fetchProfiles();
    } catch {
      message.error('Failed to reactivate profile');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'green';
      case 'Inactive':
        return 'red';
      case 'Draft':
        return 'orange';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'profile_type',
      key: 'profile_type',
      render: (type: string) => {
        const profileType = profileTypes.find(pt => pt.value === type);
        return profileType ? profileType.label : type;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Max Current (A)',
      dataIndex: 'max_current',
      key: 'max_current',
      align: 'right' as const,
      render: (value: number) => value ? `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} A` : '-',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => parseUtc(date).toLocaleDateString(),
    },
    {
      title: '',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, record: ChargingProfile) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => showModal(record)}
          >
            Edit
          </Button>
          {record.status === 'Inactive' ? (
            <Button
              type="link"
              icon={<ReloadOutlined />}
              onClick={() => handleReactivate(record.id)}
            >
              Reactivate
            </Button>
          ) : (
            <Popconfirm
              title="Are you sure you want to inactivate this profile?"
              onConfirm={() => handleInactivate(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
              >
                Inactivate
              </Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  const renderProfileFields = () => {
    const selectedType = form.getFieldValue('profile_type');
    const profileType = profileTypes.find(pt => pt.value === selectedType);

    if (!profileType) return null;

    return profileType.fields.map((field) => {
      switch (field) {
        case 'max_current':
          return (
            <Form.Item
              key={field}
              name={field}
              label="Max Current (A)"
              rules={[{ required: true, message: 'Please enter max current' }]}
            >
              <InputNumber
                min={1}
                max={100}
                step={0.1}
                style={{ width: '100%' }}
                placeholder="Enter max current in amperes"
              />
            </Form.Item>
          );
        default:
          return null;
      }
    });
  };

  return (
    <Card
      title="Profiles"
      extra={
        <Flex gap={16} align="center">
          <Flex gap={8} align="center">
            <Switch size="small" checked={showInactive} onChange={setShowInactive} />
            <Typography.Text type="secondary">Show inactive</Typography.Text>
          </Flex>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal()}
          >
            Add profile
          </Button>
        </Flex>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        columns={columns}
        dataSource={showInactive ? profiles : profiles.filter(p => p.status !== 'Inactive')}
        loading={loading}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{
          pageSize: 10,
          hideOnSinglePage: true,
          style: { padding: '0 16px' },
        }}
      />

      <Modal
        title={editingProfile ? 'Edit profile' : 'Add profile'}
        open={modalVisible}
        onOk={handleOk}
        onCancel={() => setModalVisible(false)}
        width={560}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Profile Name"
            rules={[{ required: true, message: 'Please enter profile name' }]}
          >
            <Input placeholder="Enter profile name" />
          </Form.Item>

          <Form.Item
            name="profile_type"
            label="Profile Type"
            rules={[{ required: true, message: 'Please select profile type' }]}
          >
            <Select
              placeholder="Select profile type"
              onChange={() => form.setFieldsValue({ max_current: undefined })}
              options={profileTypes.map((type) => ({ value: type.value, label: type.label }))}
            />
          </Form.Item>

          {editingProfile && (
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: 'Please select status' }]}
            >
              <Select
                placeholder="Select status"
                options={['Draft', 'Active', 'Inactive'].map((status) => ({ value: status, label: status }))}
              />
            </Form.Item>
          )}

          <Form.Item noStyle shouldUpdate={(previous, next) => previous.profile_type !== next.profile_type}>
            {renderProfileFields}
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Profiles;
