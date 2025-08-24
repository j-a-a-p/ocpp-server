import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { chargingProfileService, ChargingProfile, ProfileType } from './services/chargingProfileService';

const { Option } = Select;

const Profiles: React.FC = () => {
  const [profiles, setProfiles] = useState<ChargingProfile[]>([]);
  const [profileTypes, setProfileTypes] = useState<ProfileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ChargingProfile | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProfiles();
    fetchProfileTypes();
  }, []);

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
      render: (value: number) => value ? `${value}A` : '-',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: ChargingProfile) => (
        <div style={{ display: 'flex', gap: '8px' }}>
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
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Charging Profiles</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button
            type={showInactive ? "default" : "primary"}
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal()}
          >
            Add Profile
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={showInactive ? profiles : profiles.filter(p => p.status !== 'Inactive')}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
      />

      <Modal
        title={editingProfile ? 'Edit Profile' : 'Add Profile'}
        open={modalVisible}
        onOk={handleOk}
        onCancel={() => setModalVisible(false)}
        width={600}
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
            >
              {profileTypes.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {editingProfile && (
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: 'Please select status' }]}
            >
              <Select placeholder="Select status">
                <Option value="Draft">Draft</Option>
                <Option value="Active">Active</Option>
                <Option value="Inactive">Inactive</Option>
              </Select>
            </Form.Item>
          )}

          {renderProfileFields()}
        </Form>
      </Modal>
    </div>
  );
};

export default Profiles;
