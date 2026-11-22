import { useMemo } from "react";
import { Col, Row, theme } from "antd";
import { EuroOutlined, HistoryOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ChargeTransaction } from "../services/chargeTransactionService";
import { formatEuro, transactionCost } from "../utils/format";
import StatTile from "./StatTile";

interface UsageSummaryProps {
  transactions: ChargeTransaction[];
  loading: boolean;
}

const UsageSummary: React.FC<UsageSummaryProps> = ({ transactions, loading }) => {
  const { token } = theme.useToken();

  const totals = useMemo(
    () => ({
      sessions: transactions.length,
      energy: transactions.reduce((sum, transaction) => sum + (transaction.final_energy_kwh || 0), 0),
      cost: transactions.reduce((sum, transaction) => sum + transactionCost(transaction), 0),
    }),
    [transactions]
  );

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={8}>
        <StatTile title="Charging sessions" value={totals.sessions} icon={<HistoryOutlined />} loading={loading} />
      </Col>
      <Col xs={24} sm={8}>
        <StatTile
          title="Total energy"
          value={totals.energy}
          precision={1}
          suffix="kWh"
          icon={<ThunderboltOutlined />}
          color={token.colorSuccess}
          background={token.colorSuccessBg}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={8}>
        <StatTile
          title="Total cost"
          value={totals.cost}
          formatter={(value) => formatEuro(Number(value))}
          icon={<EuroOutlined />}
          color={token.colorWarning}
          background={token.colorWarningBg}
          loading={loading}
        />
      </Col>
    </Row>
  );
};

export default UsageSummary;
