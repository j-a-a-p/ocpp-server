import { Card, Table, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import type { MonthlyEnergyStats } from "../services/chargeTransactionService";
import { formatEuro, formatInteger, formatKwh } from "../utils/format";

const { Text } = Typography;

interface MonthlyUsageCardProps {
  stats: MonthlyEnergyStats[];
  loading: boolean;
}

const MonthlyUsageCard: React.FC<MonthlyUsageCardProps> = ({ stats, loading }) => (
  <Card
    title={
      <span>
        <CalendarOutlined style={{ marginRight: 8 }} />
        Monthly usage
      </span>
    }
    style={{ height: "100%" }}
    styles={{ body: { padding: 0 } }}
  >
    <Table
      dataSource={stats}
      rowKey={(record) => `${record.month}-${record.year}`}
      loading={loading}
      pagination={false}
      size="middle"
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "No usage yet" }}
      columns={[
        {
          title: "Month",
          dataIndex: "month",
          key: "month",
          render: (month: string, record: MonthlyEnergyStats) => <Text strong>{`${month} '${String(record.year).slice(-2)}`}</Text>,
        },
        {
          title: "Energy",
          dataIndex: "totalEnergy",
          key: "totalEnergy",
          align: "right",
          render: (energy: number) => formatKwh(energy),
        },
        {
          title: "Sessions",
          dataIndex: "transactionCount",
          key: "transactionCount",
          align: "right",
          render: (count: number) => formatInteger(count),
        },
        {
          title: "Cost",
          dataIndex: "totalCost",
          key: "totalCost",
          align: "right",
          render: (cost: number) => <Text strong>{formatEuro(cost)}</Text>,
        },
      ]}
    />
  </Card>
);

export default MonthlyUsageCard;
