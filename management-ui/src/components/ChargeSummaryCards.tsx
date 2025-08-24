import { useEffect, useState, useMemo } from "react";
import { Card, Row, Col, Statistic, Spin, message } from "antd";
import { ThunderboltOutlined, TransactionOutlined } from "@ant-design/icons";
import { getAllChargeTransactions, ChargeTransaction } from "../services/chargeTransactionService";

const ChargeSummaryCards: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchChargeTransactions();
    
    // Set up 10-second refresh interval
    const interval = setInterval(() => {
      fetchChargeTransactions();
    }, 10000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  const fetchChargeTransactions = async () => {
    try {
      const data = await getAllChargeTransactions();
      setTransactions(data);
    } catch (error) {
      console.error("Failed to load charge transactions:", error);
      message.error("Failed to load charge transactions.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals for summary cards (only valid transactions)
  const summaryData = useMemo(() => {
    const validTransactions = transactions.filter(transaction => transaction.final_energy_kwh > 0);
    const totalEnergy = validTransactions.reduce((sum, transaction) => sum + transaction.final_energy_kwh, 0);
    const totalTransactions = validTransactions.length;
    const totalCost = validTransactions.reduce((sum, transaction) => {
      const transactionCost = transaction.power_logs?.reduce((logSum, log) => {
        return logSum + (log.delta_power_cost || 0);
      }, 0) || 0;
      return sum + transactionCost;
    }, 0);
    const averageEnergy = totalTransactions > 0 ? totalEnergy / totalTransactions : 0;

    return {
      totalEnergy,
      totalTransactions,
      totalCost,
      averageEnergy
    };
  }, [transactions]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: isMobile ? '10px' : '20px' }}>
        <Spin size="large" />
        <p>Loading charge summary...</p>
      </div>
    );
  }

  return (
    <Row gutter={isMobile ? 8 : 16} style={{ marginBottom: 24 }}>
      <Col xs={12} sm={6}>
        <Card size={isMobile ? "small" : "default"}>
          <Statistic
            title={isMobile ? "Energy" : "Total Energy"}
            value={summaryData.totalEnergy}
            precision={2}
            suffix="kWh"
            prefix={<ThunderboltOutlined />}
          />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size={isMobile ? "small" : "default"}>
          <Statistic
            title={isMobile ? "Transactions" : "Total Transactions"}
            value={summaryData.totalTransactions}
            prefix={<TransactionOutlined />}
          />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size={isMobile ? "small" : "default"}>
          <Statistic
            title={isMobile ? "Cost" : "Total Cost"}
            value={summaryData.totalCost}
            precision={2}
            prefix="€"
            valueStyle={{ color: '#3f8600' }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size={isMobile ? "small" : "default"}>
          <Statistic
            title={isMobile ? "Avg Energy" : "Average Energy per Transaction"}
            value={summaryData.averageEnergy}
            precision={2}
            suffix="kWh"
          />
        </Card>
      </Col>
    </Row>
  );
};

export default ChargeSummaryCards;
