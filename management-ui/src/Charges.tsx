import { useEffect, useState, useMemo } from "react";
import { App, Button, Card, Flex, Grid, Table, Typography } from "antd";
import { CalendarOutlined, FieldTimeOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getAllChargeTransactions, ChargeTransaction, MonthlyData, YearlySummary } from "./services/chargeTransactionService";
import { addressKey, addressLabel, NO_ADDRESS } from "./utils/address";
import { parseUtc } from "./utils/dates";
import { formatEuro, formatInteger, formatNumber } from "./utils/format";
import { billingGroupKey, buildYearlyReport } from "./utils/yearlyReport";
import { downloadYearlyReportPdf } from "./utils/yearlyReportPdf";

const { Text } = Typography;

// The addresses in order of street and (numerically) house number, the charges without an address last.
// Within the same address, households are ordered by residency start date.
const compareHouseholdAddresses = (
  a: { address_key: string; address: string; residency_start_date?: string | null },
  b: { address_key: string; address: string; residency_start_date?: string | null }
) => {
  if (a.address_key === NO_ADDRESS || b.address_key === NO_ADDRESS) {
    return Number(a.address_key === NO_ADDRESS) - Number(b.address_key === NO_ADDRESS);
  }
  return (
    a.address.localeCompare(b.address, undefined, { numeric: true }) ||
    (a.residency_start_date ?? "").localeCompare(b.residency_start_date ?? "")
  );
};

const formatPeriodLabel = (year: number, startDate: string | null, endDate: string | null): string | null => {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clippedStart = startDate && startDate > yearStart ? startDate : null;
  const clippedEnd = endDate && endDate < yearEnd ? endDate : null;
  if (!clippedStart && !clippedEnd) return null;
  const from = dayjs(clippedStart ?? yearStart).format("D MMM");
  const to = dayjs(clippedEnd ?? yearEnd).format("D MMM");
  return `${from} – ${to}`;
};

const Charges: React.FC = () => {
  const { message } = App.useApp();
  const isMobile = Grid.useBreakpoint().md === false;
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);
  // The household and year of the report that is being made
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    getAllChargeTransactions()
      .then(setTransactions)
      .catch((error) => {
        console.error("Failed to load charge transactions:", error);
        message.error("Failed to load charge transactions.");
      })
      .finally(() => setLoading(false));
  }, [message]);

  // Process raw transactions into monthly and yearly summaries per household:
  // consecutive households at the same address receive separate totals and separate PDF reports.
  const reportData = useMemo(() => {
    // Filter out failed transactions (those with 0 or null final_energy_kwh)
    const validTransactions = transactions.filter(transaction => transaction.final_energy_kwh > 0);

    type Group = {
      year: number;
      month: number;
      group_key: string;
      household_id: number | null;
      address_key: string;
      address: string;
      main_resident: string | null;
      residency_start_date: string | null;
      residency_end_date: string | null;
      residents: Set<string>;
      total_energy: number;
      total_cost: number;
      transaction_count: number;
    };
    const add = (groups: Map<string, Group>, key: string, transaction: ChargeTransaction, year: number, month: number) => {
      let group = groups.get(key);
      if (!group) {
        group = {
          year,
          month,
          group_key: billingGroupKey(transaction),
          household_id: transaction.household_id ?? null,
          address_key: addressKey(transaction),
          address: addressLabel(transaction),
          main_resident: transaction.main_resident_name ?? null,
          residency_start_date: transaction.residency_start_date ?? null,
          residency_end_date: transaction.residency_end_date ?? null,
          residents: new Set(),
          total_energy: 0,
          total_cost: 0,
          transaction_count: 0,
        };
        groups.set(key, group);
      }
      group.residents.add(transaction.resident_name);
      group.total_energy += transaction.final_energy_kwh;
      group.total_cost += transaction.total_cost || 0;
      group.transaction_count += 1;
    };

    const monthlyGroups = new Map<string, Group>();
    const yearlyGroups = new Map<string, Group>();
    validTransactions.forEach(transaction => {
      const date = parseUtc(transaction.created);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth() returns 0-11
      const groupKey = billingGroupKey(transaction);
      add(monthlyGroups, `${year}|${month}|${groupKey}`, transaction, year, month);
      add(yearlyGroups, `${year}|${groupKey}`, transaction, year, month);
    });

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const residentsOf = (group: Group) => Array.from(group.residents).sort((a, b) => a.localeCompare(b));

    const monthly_data: MonthlyData[] = Array.from(monthlyGroups.values())
      .map(group => ({
        year: group.year,
        month: group.month,
        month_display: `${monthNames[group.month - 1]} '${group.year.toString().slice(2)}`,
        group_key: group.group_key,
        household_id: group.household_id,
        address_key: group.address_key,
        address: group.address,
        main_resident: group.main_resident,
        residency_start_date: group.residency_start_date,
        residency_end_date: group.residency_end_date,
        residents: residentsOf(group),
        total_energy: group.total_energy,
        transaction_count: group.transaction_count,
        total_cost: group.total_cost
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        if (a.month !== b.month) return b.month - a.month;
        return compareHouseholdAddresses(a, b);
      });

    const yearly_summaries: YearlySummary[] = Array.from(yearlyGroups.values())
      .map(group => ({
        year: group.year,
        group_key: group.group_key,
        household_id: group.household_id,
        address_key: group.address_key,
        address: group.address,
        main_resident: group.main_resident,
        residency_start_date: group.residency_start_date,
        residency_end_date: group.residency_end_date,
        residents: residentsOf(group),
        total_energy: group.total_energy,
        transaction_count: group.transaction_count,
        total_cost: group.total_cost
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return compareHouseholdAddresses(a, b);
      });

    return { monthly_data, yearly_summaries };
  }, [transactions]);

  const exportReport = async (summary: YearlySummary) => {
    setExporting(`${summary.year}-${summary.group_key}`);
    try {
      await downloadYearlyReportPdf(buildYearlyReport(transactions, summary.group_key, summary.year));
    } catch (error) {
      console.error("Failed to create the PDF report:", error);
      message.error("Failed to create the PDF report.");
    } finally {
      setExporting(null);
    }
  };

  const renderAddressCell = (record: { year: number; address: string; residency_start_date: string | null; residency_end_date: string | null }, showPeriod: boolean) => {
    const period = showPeriod ? formatPeriodLabel(record.year, record.residency_start_date, record.residency_end_date) : null;
    if (!period) return record.address;
    return (
      <Flex vertical>
        <span>{record.address}</span>
        <Text type="secondary" style={{ fontSize: 12 }}>{period}</Text>
      </Flex>
    );
  };

  const monthlyColumns = [
    {
      title: "Month",
      dataIndex: "month_display",
      key: "month_display",
      sorter: (a: MonthlyData, b: MonthlyData) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      },
      defaultSortOrder: 'descend' as const,
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      sorter: (a: MonthlyData, b: MonthlyData) => compareHouseholdAddresses(a, b),
    },
    {
      title: "Residents",
      dataIndex: "residents",
      key: "residents",
      render: (residents: string[]) => residents.join(", "),
    },
    {
      title: "Energy (kWh)",
      dataIndex: "total_energy",
      key: "total_energy",
      align: "right" as const,
      render: (value: number) => formatNumber(value),
      sorter: (a: MonthlyData, b: MonthlyData) => a.total_energy - b.total_energy,
    },
    {
      title: "Transactions",
      dataIndex: "transaction_count",
      key: "transaction_count",
      align: "right" as const,
      sorter: (a: MonthlyData, b: MonthlyData) => a.transaction_count - b.transaction_count,
    },
    {
      title: "Cost (€)",
      dataIndex: "total_cost",
      key: "total_cost",
      align: "right" as const,
      render: (value: number) => formatEuro(value),
      sorter: (a: MonthlyData, b: MonthlyData) => a.total_cost - b.total_cost,
    },
  ];

  const yearlyColumns = [
    {
      title: "Year",
      dataIndex: "year",
      key: "year",
      sorter: (a: YearlySummary, b: YearlySummary) => a.year - b.year,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      sorter: (a: YearlySummary, b: YearlySummary) => compareHouseholdAddresses(a, b),
      render: (_: unknown, record: YearlySummary) => renderAddressCell(record, true),
    },
    {
      title: "Residents",
      dataIndex: "residents",
      key: "residents",
      render: (residents: string[]) => residents.join(", "),
    },
    {
      title: "Energy (kWh)",
      dataIndex: "total_energy",
      key: "total_energy",
      align: "right" as const,
      render: (value: number) => formatNumber(value),
      sorter: (a: YearlySummary, b: YearlySummary) => a.total_energy - b.total_energy,
    },
    {
      title: "Transactions",
      dataIndex: "transaction_count",
      key: "transaction_count",
      align: "right" as const,
      sorter: (a: YearlySummary, b: YearlySummary) => a.transaction_count - b.transaction_count,
    },
    {
      title: "Cost (€)",
      dataIndex: "total_cost",
      key: "total_cost",
      align: "right" as const,
      render: (value: number) => formatEuro(value),
      sorter: (a: YearlySummary, b: YearlySummary) => a.total_cost - b.total_cost,
    },
    {
      title: "Report",
      key: "report",
      align: "center" as const,
      render: (_: unknown, record: YearlySummary) => {
        const who = record.main_resident ? ` (${record.main_resident})` : "";
        return (
          <Button
            size="small"
            icon={<FilePdfOutlined />}
            loading={exporting === `${record.year}-${record.group_key}`}
            disabled={exporting !== null}
            aria-label={`Export the ${record.year} report of ${record.address}${who} as PDF`}
            onClick={() => exportReport(record)}
          >
            PDF
          </Button>
        );
      },
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Card
        title={
          <span>
            <CalendarOutlined style={{ marginRight: 8 }} />
            Yearly summaries
          </span>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={yearlyColumns}
          dataSource={reportData.yearly_summaries}
          rowKey={(record) => `${record.year}-${record.group_key}`}
          loading={loading}
          pagination={false}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No charge transactions yet" }}
        />
      </Card>

      <Card
        title={
          <span>
            <FieldTimeOutlined style={{ marginRight: 8 }} />
            Monthly charge data
          </span>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={monthlyColumns}
          dataSource={reportData.monthly_data}
          rowKey={(record) => `${record.year}-${record.month}-${record.group_key}`}
          loading={loading}
          pagination={{
            pageSize: isMobile ? 10 : 20,
            showSizeChanger: !isMobile,
            showTotal: (total, range) => `${formatInteger(range[0])}-${formatInteger(range[1])} of ${formatInteger(total)}`,
            size: isMobile ? "small" : "medium",
            style: { padding: "0 16px" },
          }}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No charge transactions yet" }}
        />
      </Card>
    </Flex>
  );
};

export default Charges;
