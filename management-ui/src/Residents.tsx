import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  AutoComplete,
  Avatar,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Flex,
  Form,
  Input,
  Modal,
  Switch,
  Table,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import type { Key } from "react";
import {
  CalendarOutlined,
  CreditCardOutlined,
  EditOutlined,
  HomeOutlined,
  SendOutlined,
  StopOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { API_BASE_URL } from "./config";
import {
  addressSuggestions,
  groupByAddress,
  residencyStateOf,
  type Address,
  type HouseholdGroup,
  type ResidencyState,
} from "./utils/address";
import { formatInteger } from "./utils/format";

const { Text } = Typography;

interface Resident extends Address {
  id: number;
  full_name: string;
  email: string;
  status: string;
  roles: string[];
  household_id: number | null;
  is_main_member: boolean;
  household_head_id: number | null;
  residency_start_date: string | null;
  residency_end_date: string | null;
  residency_state: ResidencyState | null;
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

const formatDate = (value: string) => dayjs(value).format("D MMM YYYY");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

interface ResidentFormValues {
  full_name: string;
  email: string;
  roles: string[];
  street_name?: string;
  house_number?: string;
  house_number_suffix?: string;
  zip_code?: string;
  city?: string;
  residency_start_date?: Dayjs | null;
}

interface HouseholdMemberFormValues {
  full_name: string;
  email: string;
}

interface TerminationFormValues {
  end_date: Dayjs;
}

interface GroupRow {
  key: string;
  isGroup: true;
  address: string | null;
  sampleAddress: Address;
  visibleCount: number;
  isVacant: boolean;
  latestHousehold: HouseholdGroup<Resident> | null;
  children?: ResidentRow[];
}

interface ResidentRow extends Resident {
  key: string;
  isGroup?: false;
}

type Row = GroupRow | ResidentRow;

interface AddAtAddressContext {
  addressLabel: string;
  address: Address;
  previousEndDate: string | null;
}

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
  const [showPastResidents, setShowPastResidents] = useState(false);

  // Add / edit resident modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [addAtAddress, setAddAtAddress] = useState<AddAtAddressContext | null>(null);
  const [form] = Form.useForm<ResidentFormValues>();

  // Add household member modal
  const [addingMemberTo, setAddingMemberTo] = useState<{ household: HouseholdGroup<Resident>; addressLabel: string } | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [memberForm] = Form.useForm<HouseholdMemberFormValues>();

  // Terminate residency modal
  const [terminating, setTerminating] = useState<{ household: HouseholdGroup<Resident>; addressLabel: string } | null>(null);
  const [savingTermination, setSavingTermination] = useState(false);
  const [terminationForm] = Form.useForm<TerminationFormValues>();

  // The resident whose invitation is being sent again
  const [reinvitingId, setReinvitingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<(Key | boolean)[] | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

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

  const showResidentModal = (resident: Resident | null = null, atAddress: AddAtAddressContext | null = null) => {
    setEditingResident(resident);
    setAddAtAddress(atAddress);
    form.resetFields();
    if (resident) {
      form.setFieldsValue({
        full_name: resident.full_name,
        email: resident.email,
        roles: resident.roles ?? [],
        street_name: resident.street_name ?? undefined,
        house_number: resident.house_number ?? undefined,
        house_number_suffix: resident.house_number_suffix ?? undefined,
        zip_code: resident.zip_code ?? undefined,
        city: resident.city ?? undefined,
        residency_start_date: resident.residency_start_date ? dayjs(resident.residency_start_date) : null,
      });
    } else if (atAddress) {
      const dayAfterPrev = atAddress.previousEndDate ? dayjs(atAddress.previousEndDate).add(1, "day") : dayjs();
      const defaultStart = dayAfterPrev.isAfter(dayjs(), "day") ? dayAfterPrev : dayjs().isAfter(dayAfterPrev, "day") ? dayjs() : dayAfterPrev;
      form.setFieldsValue({
        full_name: "",
        email: "",
        roles: ["resident"],
        street_name: atAddress.address.street_name ?? undefined,
        house_number: atAddress.address.house_number ?? undefined,
        house_number_suffix: atAddress.address.house_number_suffix ?? undefined,
        zip_code: atAddress.address.zip_code ?? undefined,
        city: atAddress.address.city ?? undefined,
        residency_start_date: defaultStart,
      });
    } else {
      form.setFieldsValue({
        full_name: "",
        email: "",
        roles: ["resident"],
        residency_start_date: dayjs(),
      });
    }
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    let values: ResidentFormValues;
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
            ...(values.residency_start_date
              ? { residency_start_date: values.residency_start_date.format("YYYY-MM-DD") }
              : {}),
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

  const openAddMemberModal = (household: HouseholdGroup<Resident>, addressLabel: string) => {
    memberForm.resetFields();
    setAddingMemberTo({ household, addressLabel });
  };

  const handleAddMember = async () => {
    if (!addingMemberTo?.household.household_id) return;
    let values: HouseholdMemberFormValues;
    try {
      values = await memberForm.validateFields();
    } catch {
      return;
    }
    setSavingMember(true);
    try {
      const response = await fetch(`${API_BASE_URL}/households/${addingMemberTo.household.household_id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (response.ok) {
        message.success("Household member invited");
        setAddingMemberTo(null);
        fetchResidents();
      } else {
        try {
          const errorData = await response.json();
          message.error(typeof errorData.detail === "string" ? errorData.detail : "Failed to add household member.");
        } catch {
          message.error("Failed to add household member.");
        }
      }
    } catch (error) {
      console.error("Error adding household member:", error);
      message.error("An error occurred while adding household member.");
    } finally {
      setSavingMember(false);
    }
  };

  const openTerminateModal = (household: HouseholdGroup<Resident>, addressLabel: string) => {
    terminationForm.resetFields();
    terminationForm.setFieldsValue({
      end_date: household.end_date ? dayjs(household.end_date) : dayjs(),
    });
    setTerminating({ household, addressLabel });
  };

  const submitTermination = async (endDate: string | null) => {
    if (!terminating?.household.household_id) return;
    setSavingTermination(true);
    try {
      const response = await fetch(`${API_BASE_URL}/households/${terminating.household.household_id}/termination`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ end_date: endDate }),
      });
      if (response.ok) {
        message.success(endDate ? `Residency end date set to ${formatDate(endDate)}` : "Residency end date cleared");
        setTerminating(null);
        fetchResidents();
      } else {
        try {
          const errorData = await response.json();
          message.error(typeof errorData.detail === "string" ? errorData.detail : "Failed to update residency end date.");
        } catch {
          message.error("Failed to update residency end date.");
        }
      }
    } catch (error) {
      console.error("Error updating residency end date:", error);
      message.error("An error occurred while updating residency end date.");
    } finally {
      setSavingTermination(false);
    }
  };

  const handleTerminateOk = async () => {
    let values: TerminationFormValues;
    try {
      values = await terminationForm.validateFields();
    } catch {
      return;
    }
    await submitTermination(values.end_date.format("YYYY-MM-DD"));
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

  const { rows, visibleResidentCount, pastResidentCount } = useMemo(() => {
    const allGroups = groupByAddress(residents);
    let pastCount = 0;
    let visibleCount = 0;
    const builtRows: GroupRow[] = [];

    for (const group of allGroups) {
      const groupPastMembers = group.endedHouseholds.flatMap((h) => h.members);
      pastCount += groupPastMembers.length;

      const baseMembers =
        group.address === null || showPastResidents
          ? group.members
          : group.activeOrUpcomingHouseholds.flatMap((h) => h.members);

      const shownMembers = statusFilter?.length
        ? baseMembers.filter((resident) => statusFilter.includes(resident.status.toUpperCase()))
        : baseMembers;

      const isVacant = group.address !== null && group.activeOrUpcomingHouseholds.length === 0 && group.endedHouseholds.length > 0;

      // Hide groups with no visible members unless the address is vacant (so a new resident can be added)
      // and no status filter is actively narrowing the list.
      if (shownMembers.length === 0 && !(isVacant && !statusFilter?.length)) {
        continue;
      }

      visibleCount += shownMembers.length;
      builtRows.push({
        key: `address:${group.key}`,
        isGroup: true as const,
        address: group.address,
        sampleAddress: group.sampleAddress,
        visibleCount: shownMembers.length,
        isVacant,
        latestHousehold: group.latestHousehold,
        children: shownMembers.length > 0 ? shownMembers.map((member) => ({ ...member, key: String(member.id) })) : undefined,
      });
    }

    return { rows: builtRows, visibleResidentCount: visibleCount, pastResidentCount: pastCount };
  }, [residents, statusFilter, showPastResidents]);

  const expandedRowKeys = rows.map((row) => row.key).filter((key) => !collapsedKeys.has(key));
  const suggestions = addressSuggestions(addressOptions, { street_name: street, house_number: houseNumber, zip_code: zipCode, city });
  const editingHouseholdMember = editingResident != null && editingResident.household_id != null && !editingResident.is_main_member;
  const addressLocked = editingHouseholdMember || addAtAddress !== null;
  const toOptions = (values: string[]) => values.map((value) => ({ value }));
  const matchesInput = (input: string, option?: { value: string }) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase());
  const groupCell = (record: Row, colSpan: number) => (record.isGroup ? { colSpan } : {});
  const hiddenCell = (record: Row) => (record.isGroup ? { colSpan: 0 } : {});

  const renderGroupHeader = (record: GroupRow) => {
    const latest = record.latestHousehold;
    const hasEndDate = latest?.end_date != null;
    const canAddHouseholdMember =
      record.address !== null && latest != null && latest.household_id != null && latest.state !== "ended";
    const canTerminate =
      record.address !== null && latest != null && latest.household_id != null && !hasEndDate;
    const canEditEndDate =
      record.address !== null && latest != null && latest.household_id != null && hasEndDate && latest.state !== "ended";
    const canAddNewResident = record.address !== null && hasEndDate;

    return (
      <Flex align="center" justify="space-between" wrap gap={8}>
        <Flex align="center" gap={8} wrap>
          <HomeOutlined style={{ color: token.colorPrimary }} />
          <Text strong>{record.address ?? "No address"}</Text>
          {record.isVacant ? (
            <Tag>
              {latest?.end_date ? `Vacant since ${formatDate(latest.end_date)}` : "Vacant"}
            </Tag>
          ) : (
            <Text type="secondary">
              {record.visibleCount === 1 ? "1 person" : `${formatInteger(record.visibleCount)} people`}
            </Text>
          )}
          {!record.isVacant && latest?.end_date && (
            <Tag color="warning">Ends {formatDate(latest.end_date)}</Tag>
          )}
        </Flex>
        {record.address !== null && (
          <Flex align="center" gap={8} wrap onClick={(event) => event.stopPropagation()}>
            {canAddHouseholdMember && latest && (
              <Button
                size="small"
                icon={<UsergroupAddOutlined />}
                aria-label={`Add household member at ${record.address}`}
                onClick={() => openAddMemberModal(latest, record.address!)}
              >
                Add household member
              </Button>
            )}
            {canTerminate && latest && (
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                aria-label={`Terminate residency at ${record.address}`}
                onClick={() => openTerminateModal(latest, record.address!)}
              >
                Terminate residency
              </Button>
            )}
            {canEditEndDate && latest && (
              <Button
                size="small"
                icon={<CalendarOutlined />}
                aria-label={`Edit end date at ${record.address}`}
                onClick={() => openTerminateModal(latest, record.address!)}
              >
                Edit end date
              </Button>
            )}
            {canAddNewResident && latest && (
              <Button
                size="small"
                type="primary"
                icon={<UserAddOutlined />}
                aria-label={`Add new resident at ${record.address}`}
                onClick={() =>
                  showResidentModal(null, {
                    addressLabel: record.address!,
                    address: record.sampleAddress,
                    previousEndDate: latest.end_date,
                  })
                }
              >
                Add new resident
              </Button>
            )}
          </Flex>
        )}
      </Flex>
    );
  };

  return (
    <Card
      title={`${formatInteger(visibleResidentCount)} residents`}
      extra={
        <Flex align="center" gap={16} wrap>
          {pastResidentCount > 0 && (
            <Flex align="center" gap={8}>
              <Switch
                size="small"
                checked={showPastResidents}
                onChange={setShowPastResidents}
                aria-label="Show past residents"
              />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Show past residents ({formatInteger(pastResidentCount)})
              </Text>
            </Flex>
          )}
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => showResidentModal()}>
            Add resident
          </Button>
        </Flex>
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
            render: (_: unknown, record) => {
              if (record.isGroup) return renderGroupHeader(record);
              const state = record.household_id != null ? residencyStateOf(record) : null;
              const ended = state === "ended";
              return (
                <Flex align="center" gap={12} style={ended ? { opacity: 0.65 } : undefined}>
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
              );
            },
          },
          {
            title: "Roles",
            key: "roles",
            onCell: hiddenCell,
            render: (_: unknown, record) => {
              if (record.isGroup) return null;
              const isResident = (record.roles ?? []).includes("resident");
              const isMain = record.is_main_member || (isResident && record.household_head_id === null);
              return (
                <Flex gap={4} wrap>
                  {(record.roles ?? []).includes("manager") && <Tag color="blue">Manager</Tag>}
                  {isResident &&
                    (isMain ? (
                      <Tooltip title="Receives invoices and updates">
                        <Tag color="cyan">Main member</Tag>
                      </Tooltip>
                    ) : (
                      <Tag>Household member</Tag>
                    ))}
                </Flex>
              );
            },
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
              const state = record.household_id != null ? residencyStateOf(record) : null;
              return (
                <Flex gap={4} wrap align="center">
                  <Tag color={tag?.color}>{tag?.label ?? record.status}</Tag>
                  {state === "upcoming" && record.residency_start_date && (
                    <Tag color="processing">Starts {formatDate(record.residency_start_date)}</Tag>
                  )}
                  {state === "active" && record.residency_end_date && (
                    <Tag color="warning">Ends {formatDate(record.residency_end_date)}</Tag>
                  )}
                  {state === "ended" && record.residency_end_date && (
                    <Tag>Ended {formatDate(record.residency_end_date)}</Tag>
                  )}
                </Flex>
              );
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
                  <Button type="text" icon={<EditOutlined />} onClick={() => showResidentModal(record)}>
                    Edit
                  </Button>
                </Flex>
              ),
          },
        ]}
      />

      {/* Cards dialog */}
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

      {/* Add / Edit resident modal */}
      <Modal
        title={
          editingResident
            ? "Edit resident"
            : addAtAddress
              ? `Add new resident at ${addAtAddress.addressLabel}`
              : "Add resident"
        }
        open={isModalOpen}
        onOk={handleOk}
        okText={editingResident ? "Save" : "Send invitation"}
        confirmLoading={saving}
        onCancel={() => setIsModalOpen(false)}
        forceRender
      >
        {!editingResident && (
          <Typography.Paragraph type="secondary">
            The resident becomes the main member of the household, receives invoices and updates, and gets an email link to activate their account.
          </Typography.Paragraph>
        )}
        <Form form={form} layout="vertical">
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
            <Checkbox.Group options={ROLES} disabled={editingHouseholdMember || addAtAddress !== null} />
          </Form.Item>
          {roles?.includes("resident") && (
            <>
              <Form.Item
                name="residency_start_date"
                label="Residency start date"
                rules={
                  editingResident
                    ? []
                    : [{ required: true, message: "Please select a start date" }]
                }
                extra={
                  addAtAddress?.previousEndDate
                    ? `Must be after the previous residency's end date (${formatDate(addAtAddress.previousEndDate)}).`
                    : "Charging is enabled starting on this date."
                }
              >
                <DatePicker
                  style={{ width: "100%" }}
                  format="YYYY-MM-DD"
                  disabled={editingHouseholdMember}
                  disabledDate={(current) =>
                    Boolean(
                      addAtAddress?.previousEndDate &&
                        current &&
                        !current.isAfter(dayjs(addAtAddress.previousEndDate), "day"),
                    )
                  }
                />
              </Form.Item>
              <Form.Item name="street_name" label="Street name" rules={[{ required: true, message: "Please enter street name" }]}>
                <AutoComplete options={toOptions(suggestions.street_name)} filterOption={matchesInput} disabled={addressLocked} />
              </Form.Item>
              <Flex gap={12}>
                <Form.Item
                  name="house_number"
                  label="House number"
                  rules={[{ required: true, message: "Please enter house number" }]}
                  style={{ flex: 1 }}
                >
                  <AutoComplete options={toOptions(suggestions.house_number)} filterOption={matchesInput} disabled={addressLocked} />
                </Form.Item>
                <Form.Item name="house_number_suffix" label="Suffix" style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.house_number_suffix)} filterOption={matchesInput} disabled={addressLocked} />
                </Form.Item>
              </Flex>
              <Flex gap={12}>
                <Form.Item name="zip_code" label="Zip code" rules={[{ required: true, message: "Please enter zip code" }]} style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.zip_code)} filterOption={matchesInput} disabled={addressLocked} />
                </Form.Item>
                <Form.Item name="city" label="City" rules={[{ required: true, message: "Please enter city" }]} style={{ flex: 1 }}>
                  <AutoComplete options={toOptions(suggestions.city)} filterOption={matchesInput} disabled={addressLocked} />
                </Form.Item>
              </Flex>
              {editingHouseholdMember && (
                <Typography.Paragraph type="secondary">
                  A household member lives in the household of the main member. Change the main member's address to move the whole household.
                </Typography.Paragraph>
              )}
            </>
          )}
        </Form>
      </Modal>

      {/* Add household member modal */}
      <Modal
        title={addingMemberTo ? `Add household member at ${addingMemberTo.addressLabel}` : "Add household member"}
        open={addingMemberTo !== null}
        onOk={handleAddMember}
        okText="Send invitation"
        confirmLoading={savingMember}
        onCancel={() => setAddingMemberTo(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          They join this household at <strong>{addingMemberTo?.addressLabel}</strong> and can charge with their own cards.
          {addingMemberTo?.household.mainMember
            ? ` Invoices and updates still go to ${addingMemberTo.household.mainMember.full_name}.`
            : ""}
        </Typography.Paragraph>
        <Form form={memberForm} name="household-member" layout="vertical">
          <Form.Item name="full_name" label="Full name" rules={[{ required: true, message: "Please enter full name" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Please enter a valid email" }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Terminate residency modal */}
      <Modal
        title={
          terminating
            ? terminating.household.end_date
              ? `Edit end date for ${terminating.addressLabel}`
              : `Terminate residency at ${terminating.addressLabel}`
            : "Terminate residency"
        }
        open={terminating !== null}
        onCancel={() => setTerminating(null)}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setTerminating(null)}>
            Cancel
          </Button>,
          ...(terminating?.household.end_date
            ? [
                <Button key="clear" loading={savingTermination} onClick={() => submitTermination(null)}>
                  Clear end date
                </Button>,
              ]
            : []),
          <Button key="ok" type="primary" danger loading={savingTermination} onClick={handleTerminateOk}>
            {terminating?.household.end_date ? "Update end date" : "Terminate residency"}
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary">
          This sets the residency end date for the entire household. Charging stops after this date; former residents keep read-only access to their past sessions.
        </Typography.Paragraph>
        {terminating && (
          <Typography.Paragraph>
            <Text strong>Affected household members: </Text>
            {terminating.household.members.map((member) => member.full_name).join(", ")}
          </Typography.Paragraph>
        )}
        <Form form={terminationForm} name="termination" layout="vertical">
          <Form.Item
            name="end_date"
            label="Residency end date"
            rules={[{ required: true, message: "Please select an end date" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              format="YYYY-MM-DD"
              disabledDate={(current) =>
                Boolean(
                  terminating?.household.start_date &&
                    current &&
                    current.isBefore(dayjs(terminating.household.start_date), "day"),
                )
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Residents;
