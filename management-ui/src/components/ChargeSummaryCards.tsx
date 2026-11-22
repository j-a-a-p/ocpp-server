import { useEffect, useMemo, useState } from "react";
import { App, Col, Row, theme } from "antd";
import { EuroOutlined, HistoryOutlined, RiseOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { getAllChargeTransactions, type ChargeTransaction } from "../services/chargeTransactionService";
import { formatEuro } from "../utils/format";
import StatTile from "./StatTile";

const ChargeSummaryCards: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchChargeTransactions = async () => {
      try {
        const data = await getAllChargeTransactions();
        if (!cancelled) setTransactions(data);
      } catch (error) {
        console.error("Failed to load charge transactions:", error);
        if (!cancelled) message.error("Failed to load charge transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchChargeTransactions();
    const interval = setInterval(fetchChargeTransactions, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [message]);

  const summary = useMemo(() => {
    const valid = transactions.filter((transaction) => transaction.final_energy_kwh > 0);
    const totalEnergy = valid.reduce((sum, transaction) => sum + transaction.final_energy_kwh, 0);
    const totalCost = valid.reduce((sum, transaction) => sum + (transaction.total_cost || 0), 0);
    return {
      totalEnergy,
      totalTransactions: valid.length,
      totalCost,
      averageEnergy: valid.length > 0 ? totalEnergy / valid.length : 0,
    };
  }, [transactions]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12}>
        <StatTile
          title="Total energy"
          value={summary.totalEnergy}
          precision={2}
          suffix="kWh"
          icon={<ThunderboltOutlined />}
          color={token.colorSuccess}
          background={token.colorSuccessBg}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={12}>
        <StatTile title="Charging sessions" value={summary.totalTransactions} icon={<HistoryOutlined />} loading={loading} />
      </Col>
      <Col xs={24} sm={12}>
        <StatTile
          title="Total cost"
          value={summary.totalCost}
          formatter={(value) => formatEuro(value)}
          icon={<EuroOutlined />}
          color={token.colorWarning}
          background={token.colorWarningBg}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={12}>
        <StatTile
          title="Average per session"
          value={summary.averageEnergy}
          precision={2}
          suffix="kWh"
          icon={<RiseOutlined />}
          color={token.blue}
          background={token.blue1}
          loading={loading}
        />
      </Col>
    </Row>
  );
};

export default ChargeSummaryCards;
