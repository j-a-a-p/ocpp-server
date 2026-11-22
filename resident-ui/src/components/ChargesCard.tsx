import { lazy, Suspense } from "react";
import { Button, Card, Flex, Spin, Table, theme, Tooltip, Typography } from "antd";
import { LineChartOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ChargeTransaction } from "../services/chargeTransactionService";
import { formatEuro, formatInteger, formatKwh, transactionCost } from "../utils/format";
import { parseUtc } from "../utils/dates";

const PowerLogsChart = lazy(() => import("./PowerLogsChart"));

const { Text } = Typography;

interface ChargesCardProps {
  transactions: ChargeTransaction[];
  loading: boolean;
}

const hasChart = (transaction: ChargeTransaction) => (transaction.power_logs?.length ?? 0) > 1;

const ChargesCard: React.FC<ChargesCardProps> = ({ transactions, loading }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={
        <span>
          <ThunderboltOutlined style={{ marginRight: 8 }} />
          Charging sessions
        </span>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        dataSource={transactions}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No charging sessions yet" }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ["5", "10", "20", "50"],
          showTotal: (total, range) => `${formatInteger(range[0])}-${formatInteger(range[1])} of ${formatInteger(total)}`,
          style: { padding: "0 16px" },
        }}
        expandable={{
          rowExpandable: hasChart,
          expandedRowRender: (record) => (
            <Suspense
              fallback={
                <Flex justify="center" style={{ padding: 32 }}>
                  <Spin />
                </Flex>
              }
            >
              <PowerLogsChart powerLogs={record.power_logs} transactionId={record.id} />
            </Suspense>
          ),
          expandIcon: ({ expanded, expandable, onExpand, record }) =>
            expandable ? (
              <Tooltip title={expanded ? "Hide chart" : "Show chart"}>
                <Button
                  type="text"
                  size="small"
                  icon={<LineChartOutlined />}
                  aria-label={expanded ? "Hide chart" : "Show chart"}
                  style={{ color: expanded ? token.colorPrimary : token.colorTextSecondary }}
                  onClick={(event) => onExpand(record, event)}
                />
              </Tooltip>
            ) : null,
        }}
        columns={[
          {
            title: "Date",
            dataIndex: "created",
            key: "created",
            render: (created: string) => {
              const date = parseUtc(created);
              return (
                <Flex vertical>
                  <Text strong>{date.toLocaleDateString()}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </Flex>
              );
            },
          },
          {
            title: "Card",
            dataIndex: "card_name",
            key: "card_name",
            render: (cardName: string | undefined, record) => cardName || <Text code>{record.rfid}</Text>,
          },
          {
            title: "Station",
            dataIndex: "station_id",
            key: "station_id",
          },
          {
            title: "Energy",
            dataIndex: "final_energy_kwh",
            key: "final_energy_kwh",
            align: "right",
            render: (energy: number | null) => (energy ? formatKwh(energy) : <Text type="secondary">-</Text>),
          },
          {
            title: "Cost",
            key: "cost",
            align: "right",
            render: (_: unknown, record) => {
              const cost = transactionCost(record);
              return cost > 0 ? <Text strong>{formatEuro(cost)}</Text> : <Text type="secondary">-</Text>;
            },
          },
        ]}
      />
    </Card>
  );
};

export default ChargesCard;
