import { useState } from "react";
import { Button, Card, Empty, Flex, Form, Input, Modal, Tag, theme, Typography } from "antd";
import { TeamOutlined, UserAddOutlined } from "@ant-design/icons";
import type { HouseholdMember } from "../services/householdService";
import { formatInteger } from "../utils/format";

const { Text } = Typography;

interface HouseholdMembersCardProps {
  members: HouseholdMember[];
  loading: boolean;
  /** The address of the resident, which is the address of every household member. Null when it is not known. */
  address: string | null;
  /** Returns whether the invitation was sent. */
  onInvite: (member: { full_name: string; email: string }) => Promise<boolean>;
}

const statusTags: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "success", label: "Active" },
  INVITED: { color: "warning", label: "Invited" },
};

const HouseholdMembersCard: React.FC<HouseholdMembersCardProps> = ({ members, loading, address, onInvite }) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm<{ full_name: string; email: string }>();

  const handleOk = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSending(true);
    try {
      if (await onInvite(values)) {
        setOpen(false);
        form.resetFields();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card
      title={
        <span>
          <TeamOutlined style={{ marginRight: 8 }} />
          Household members
        </span>
      }
      extra={
        <Flex align="center" gap={8}>
          <Tag>{formatInteger(members.length)}</Tag>
          <Button type="primary" icon={<UserAddOutlined />} disabled={!address} onClick={() => setOpen(true)}>
            Invite
          </Button>
        </Flex>
      }
      loading={loading}
      style={{ height: "100%" }}
    >
      {!address && (
        <Typography.Paragraph type="secondary">
          Your address is not known yet. Ask a manager to add it, then you can invite your household.
        </Typography.Paragraph>
      )}
      {members.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No household members yet. They can charge with their own cards." />
      ) : (
        <Flex vertical gap={12}>
          {members.map((member) => {
            const tag = statusTags[member.status.toUpperCase()];
            return (
              <Flex key={member.id} align="center" gap={12}>
                <Flex vertical style={{ minWidth: 0, flex: 1 }}>
                  <Text strong>{member.full_name}</Text>
                  <Text type="secondary" style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {member.email}
                  </Text>
                </Flex>
                <Tag color={tag?.color}>{tag?.label ?? member.status}</Tag>
              </Flex>
            );
          })}
        </Flex>
      )}
      <Modal
        title="Invite a household member"
        open={open}
        onOk={handleOk}
        okText="Send invitation"
        confirmLoading={sending}
        onCancel={() => setOpen(false)}
        forceRender
      >
        <Typography.Paragraph type="secondary">
          They receive an email with a link to activate their account. They live at your address
          {address ? <strong>{` (${address})`}</strong> : null} and can charge with their own cards.
        </Typography.Paragraph>
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

export default HouseholdMembersCard;
