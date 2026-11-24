import { useCallback, useEffect, useMemo, useState } from "react";
import { App, AutoComplete, Avatar, Button, Card, Checkbox, Flex, Form, Input, Modal, Switch, Table, Tag, theme, Typography } from "antd";
import type { Key } from "react";
import { CreditCardOutlined, EditOutlined, HomeOutlined, SendOutlined, UserAddOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { addressSuggestions, groupByAddress, type Address } from "./utils/address";
import { formatInteger } from "./utils/format";

const { Text } = Typography;

interface Resident extends Address {
  id: number;
  full_name: string;
  email: string;
  status: string;
  roles: string[];
  household_head_id: number | null;
}

/** A charging card. A card that is off stays registered but cannot start a charge. */
interface ChargeCard {
  rfid: string;
  name: string;
  resident_id: number;
  enabled: boolean;
}

/** The roles an account can have. A new role only needs an entry here (and in the API). */
const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "resident", label: "Resident (can charge)" },
];

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

interface FormValues {
  full_name: string;
  email: string;
  roles: string[];
  street_name?: string;
  house_number?: string;
  house_number_suffix?: string;
  zip_code?: string;
  city?: string;
}

interface GroupRow {
  key: string;
  isGroup: true;
  address: string | null;
  count: number;
  children: ResidentRow[];
}

interface ResidentRow extends Resident {
  key: string;
  isGroup?: false;
}

type Row = GroupRow | ResidentRow;

const emptyForm: FormValues = { full_name: "", email: "", roles: ["resident"] };

const Residents: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [residents, setResidents] = useState<Resident[]>([]);
  const [cards, setCards] = useState<ChargeCard[]>([]);
  // The resident whose cards are shown in the dialog
  const [cardsOfResident, setCardsOfResident] = useState<Resident | null>(null);
  // The card that is being switched on or off
  const [switchingRfid, setSwitchingRfid] = useState<string | null>(null);
  const [addressOptions, setAddressOptions] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The resident whose invitation is being sent again
  const [reinvitingId, setReinvitingId] = useState<number | null>(null);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [statusFilter, setStatusFilter] = useState<(Key | boolean)[] | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [form] = Form.useForm<FormValues>();
  const roles = Form.useWatch("roles", form);
  const street = Form.useWatch("street_name", form);
  const houseNumber = Form.useWatch("house_number", form);
  const zipCode = Form.useWatch("zip_code", form);
  const city = Form.useWatch("city", form);

  const fetchResidents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/residents/?limit=1000`, {
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

  const fetchAddressOptions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/residents/address-options`, { credentials: "include" });
      if (response.ok) setAddressOptions(await response.json());
    } catch (error) {
      // The suggestions are a help, the form works without them.
      console.error("Failed to load the addresses:", error);
    }
  }, []);

  const fetchCards = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/cards/?limit=10000`, { credentials: "include" });
      if (response.ok) setCards(await response.json());
    } catch (error) {
      console.error("Failed to load the cards:", error);
      message.error("Failed to load the cards.");
    }
  }, [message]);

  useEffect(() => {
    fetchResidents();
    fetchAddressOptions();
    fetchCards();
  }, [fetchResidents, fetchAddressOptions, fetchCards]);

  const showModal = (resident: Resident | null = null) => {
    setEditingResident(resident);
    form.resetFields();
    form.setFieldsValue(
      resident
        ? {
            full_name: resident.full_name,
            email: resident.email,
            roles: resident.roles ?? [],
            street_name: resident.street_name ?? undefined,
            house_number: resident.house_number ?? undefined,
            house_number_suffix: resident.house_number_suffix ?? undefined,
            zip_code: resident.zip_code ?? undefined,
            city: resident.city ?? undefined,
          }
        : emptyForm
    );
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const isResident = values.roles.includes("resident");
    const body = {
      full_name: values.full_name,
      ...(editingResident ? {} : { email: values.email }),
      roles: values.roles,
      ...(isResident
        ? {
            street_name: values.street_name,
            house_number: values.house_number,
            house_number_suffix: values.house_number_suffix || null,
            zip_code: values.zip_code,
            city: values.city,
          }
        : {}),
    };
    setSaving(true);
    try {
      const method = editingResident ? "PUT" : "POST";
      const url = editingResident ? `${API_BASE_URL}/residents/${editingResident.id}` : `${API_BASE_URL}/residents/`;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (response.ok) {
        message.success(editingResident ? "Resident updated" : "Resident invited");
        setIsModalOpen(false);
        fetchResidents();
        fetchAddressOptions();
      } else {
        try {
          const errorData = await response.json();
          message.error(typeof errorData.detail === "string" ? errorData.detail : "Failed to save resident.");
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

  const switchCard = async (card: ChargeCard, enabled: boolean) => {
    setSwitchingRfid(card.rfid);
    try {
      const response = await fetch(`${API_BASE_URL}/cards/${encodeURIComponent(card.rfid)}/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        setCards((current) => current.map((other) => (other.rfid === card.rfid ? { ...other, enabled } : other)));
        message.success(`Card ${card.name} ${enabled ? "enabled" : "disabled"}`);
      } else {
        try {
          const errorData = await response.json();
          message.error(typeof errorData.detail === "string" ? errorData.detail : "Failed to change the card.");
        } catch {
          message.error("Failed to change the card.");
        }
      }
    } catch (error) {
      console.error("Error changing the card:", error);
      message.error("An error occurred while changing the card.");
    } finally {
      setSwitchingRfid(null);
    }
  };

  const cardsOf = (resident: Resident) =>
    cards.filter((card) => card.resident_id === resident.id).sort((a, b) => a.name.localeCompare(b.name));

  const cardsLabel = (list: ChargeCard[]) => {
    const off = list.filter((card) => !card.enabled).length;
    const count = list.length === 1 ? "1 card" : `${formatInteger(list.length)} cards`;
    return off > 0 ? `${count}, ${off} disabled` : count;
  };

  const reinvite = async (resident: Resident) => {
    setReinvitingId(resident.id);
    try {
      const response = await fetch(`${API_BASE_URL}/residents/${resident.id}/send-invitation`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        message.success(`Invitation sent to ${resident.email}`);
      } else {
        try {
          const errorData = await response.json();
          message.error(typeof errorData.detail === "string" ? errorData.detail : "Failed to send the invitation.");
        } catch {
          message.error("Failed to send the invitation.");
        }
      }
    } catch (error) {
      console.error("Error sending the invitation:", error);
      message.error("An error occurred while sending the invitation.");
    } finally {
      setReinvitingId(null);
    }
  };

  const rows: Row[] = useMemo(() => {
    const shown = statusFilter?.length ? residents.filter((resident) => statusFilter.includes(resident.status.toUpperCase())) : residents;
    return groupByAddress(shown).map((group) => ({
      key: `address:${group.key}`,
      isGroup: true as const,
      address: group.address,
      count: group.members.length,
      children: group.members.map((member) => ({ ...member, key: String(member.id) })),
    }));
  }, [residents, statusFilter]);

  const expandedRowKeys = rows.map((row) => row.key).filter((key) => !collapsedKeys.has(key));
  const suggestions = addressSuggestions(addressOptions, { street_name: street, house_number: houseNumber, zip_code: zipCode, city });
  const editingHouseholdMember = editingResident?.household_head_id != null;
  const toOptions = (values: string[]) => values.map((value) => ({ value }));
  const matchesInput = (input: string, option?: { value: string }) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase());
  const groupCell = (record: Row, colSpan: number) => (record.isGroup ? { colSpan } : {});
  const hiddenCell = (record: Row) => (record.isGroup ? { colSpan: 0 } : {});

  return (
    <Card
      title={`${formatInteger(residents.length)} residents`}
      extra={
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>
          Add resident
        </Button>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table<Row>
        dataSource={rows}
        loading={loading}
        scroll={{ x: "max-content" }}
        pagination={false}
        expandable={{
          expandedRowKeys,
          onExpand: (expanded, record) =>
            setCollapsedKeys((current) => {
              const next = new Set(current);
              if (expanded) next.delete(record.key);
              else next.add(record.key);
              return next;
            }),
        }}
        onChange={(_pagination, filters) => setStatusFilter(filters.status ?? null)}
        columns={[
          {
            title: "Resident",
            key: "full_name",
            onCell: (record) => groupCell(record, 4),
            render: (_: unknown, record) =>
              record.isGroup ? (
                <Flex align="center" gap={8}>
                  <HomeOutlined style={{ color: token.colorPrimary }} />
                  <Text strong>{record.address ?? "No address"}</Text>
                  <Text type="secondary">{record.count === 1 ? "1 person" : `${formatInteger(record.count)} people`}</Text>
                </Flex>
              ) : (
                <Flex align="center" gap={12}>
                  <Avatar style={{ flex: "none", color: token.colorPrimary, background: token.colorPrimaryBg, fontWeight: 600 }}>
                    {initials(record.full_name)}
                  </Avatar>
                  <Flex vertical>
                    <Text strong>{record.full_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {record.email}
                    </Text>
                    {cardsOf(record).length > 0 && (
                      <Button
                        type="link"
                        size="small"
                        icon={<CreditCardOutlined />}
                        aria-label={cardsLabel(cardsOf(record))}
                        onClick={() => setCardsOfResident(record)}
                        style={{ padding: 0, height: "auto", fontSize: 12, justifyContent: "flex-start" }}
                      >
                        {cardsLabel(cardsOf(record))}
                      </Button>
                    )}
                  </Flex>
                </Flex>
              ),
          },
          {
            title: "Roles",
            key: "roles",
            onCell: hiddenCell,
            render: (_: unknown, record) =>
              record.isGroup ? null : (
                <Flex gap={4} wrap>
                  {(record.roles ?? []).includes("manager") && <Tag color="blue">Manager</Tag>}
                  {(record.roles ?? []).includes("resident") && (
                    <Tag>{record.household_head_id !== null ? "Household member" : "Resident"}</Tag>
                  )}
                </Flex>
              ),
          },
          {
            title: "Status",
            key: "status",
            filters: Object.entries(statusTags).map(([value, { label }]) => ({ text: label, value })),
            filteredValue: statusFilter,
            onCell: hiddenCell,
            render: (_: unknown, record) => {
              if (record.isGroup) return null;
              const tag = statusTags[record.status.toUpperCase()];
              return <Tag color={tag?.color}>{tag?.label ?? record.status}</Tag>;
            },
          },
          {
            title: "",
            key: "action",
            align: "right",
            onCell: hiddenCell,
            render: (_: unknown, record) =>
              record.isGroup ? null : (
                <Flex gap={4} justify="flex-end">
                  {record.status.toUpperCase() === "INVITED" && (
                    <Button
                      type="text"
                      icon={<SendOutlined />}
                      loading={reinvitingId === record.id}
                      aria-label={`Send the invitation again to ${record.full_name}`}
                      onClick={() => reinvite(record)}
                    >
                      Re-invite
                    </Button>
                  )}
                  <Button type="text" icon={<EditOutlined />} onClick={() => showModal(record)}>
                    Edit
                  </Button>
                </Flex>
              ),
          },
        ]}
      />
      <Modal
        title={cardsOfResident ? `Cards of ${cardsOfResident.full_name}` : "Cards"}
        open={cardsOfResident !== null}
        onCancel={() => setCardsOfResident(null)}
        footer={null}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          A card that is disabled stays registered but cannot start a charge. A charge that is running is not stopped.
        </Typography.Paragraph>
        <Flex vertical gap={12}>
          {(cardsOfResident ? cardsOf(cardsOfResident) : []).map((card) => (
            <Flex key={card.rfid} align="center" gap={12}>
              <CreditCardOutlined style={{ fontSize: 18, color: card.enabled ? token.colorPrimary : token.colorTextQuaternary }} />
              <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                <Text strong delete={!card.enabled}>
                  {card.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, fontFamily: token.fontFamilyCode }}>
                  {card.rfid}
                </Text>
              </Flex>
              {!card.enabled && <Tag color="error">Disabled</Tag>}
              <Switch
                checked={card.enabled}
                loading={switchingRfid === card.rfid}
                aria-label={`Card ${card.name} enabled`}
                onChange={(checked) => switchCard(card, checked)}
              />
            </Flex>
          ))}
        </Flex>
      </Modal>
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
        <Form form={form} layout="vertical" initialValues={emptyForm}>
          <Form.Item name="full_name" label="Full name" rules={[{ required: true, message: "Please enter full name" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Please enter a valid email" }]}>
            <Input disabled={!!editingResident} />
          </Form.Item>
          <Form.Item
            name="roles"
            label="Roles"
            rules={[{ type: "array", min: 1, message: "Choose at least one role" }]}
            extra="A resident has an address and can charge. A manager can use this portal."
          >
            <Checkbox.Group options={ROLES} disabled={editingHouseholdMember} />
          </Form.Item>
          {roles?.includes("resident") && (
            <>
              <Form.Item name="street_name" label="Street name" rules={[{ required: true, message: "Please enter street name" }]}>
                <AutoComplete options={toOptions(suggestions.street_name)} filterOption={matchesInput} disabled={editingHouseholdMember} />
              </Form.Item>
              <Flex gap={12}>
                <Form.Item
                  name="house_number"
                  label="House number"
                  rules={[{ required: true, message: "Please enter house number" }]}
                  style={{ flex: 1 }}
                >
                  <AutoComplete options={toOptions(suggestions.house_number)} filterOption={matchesInput} disabled={editingHouseholdMember} />
                </Form.Item>
                <Form.Item name="house_number_suffix" label="Suffix" style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.house_number_suffix)} filterOption={matchesInput} disabled={editingHouseholdMember} />
                </Form.Item>
              </Flex>
              <Flex gap={12}>
                <Form.Item name="zip_code" label="Zip code" rules={[{ required: true, message: "Please enter zip code" }]} style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.zip_code)} filterOption={matchesInput} disabled={editingHouseholdMember} />
                </Form.Item>
                <Form.Item name="city" label="City" rules={[{ required: true, message: "Please enter city" }]} style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.city)} filterOption={matchesInput} disabled={editingHouseholdMember} />
                </Form.Item>
              </Flex>
              {editingHouseholdMember && (
                <Typography.Paragraph type="secondary">
                  A household member lives at the address of the resident who invited them. Change that address to move the whole household.
                </Typography.Paragraph>
              )}
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default Residents;
