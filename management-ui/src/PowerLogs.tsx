import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Spin, message, Typography } from "antd";
import { Column } from "@ant-design/charts";
import { getPowerLogs, PowerLog } from "./services/powerLogService";
import { ThunderboltOutlined, ClockCircleOutlined, FireOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface AnalyticsData {
  current_year_summary: {
    total_records: number;
    total_hours: number;
    total_kwh: number;
    max_power_kw: number;
    avg_power_kw: number;
  };
  monthly_data: Array<{
    year: number;
    month: number;
    month_name: string;
    total_records: number;
    total_hours: number;
    total_kwh: number;
    max_power_kw: number;
    avg_power_kw: number;
  }>;
  hourly_distribution: number[];
}

const PowerLogs: React.FC = () => {
  const [powerLogs, setPowerLogs] = useState<PowerLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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
    fetchPowerLogs();
  }, []);

  useEffect(() => {
    if (powerLogs.length > 0) {
      calculateAnalytics();
    }
  }, [powerLogs]);

  const fetchPowerLogs = async () => {
    try {
      setLoading(true);
      const data = await getPowerLogs(0, 10000); // Get more data for analytics
      setPowerLogs(data);
    } catch (error) {
      console.error("Failed to load PowerLog data:", error);
      message.error("Failed to load PowerLog data.");
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Filter data for last 12 months
    const recentData = powerLogs.filter(log => {
      const logDate = new Date(log.created);
      return logDate >= twelveMonthsAgo;
    });

    // Current year data
    const currentYearData = powerLogs.filter(log => {
      const logDate = new Date(log.created);
      return logDate.getFullYear() === currentYear;
    });

    // Calculate current year summary
    const currentYearSummary = {
      total_records: currentYearData.length,
      total_hours: calculateTotalHoursByTransaction(currentYearData),
      total_kwh: calculateTotalEnergyByTransaction(currentYearData),
      max_power_kw: Math.max(...currentYearData.map(log => log.power_kw), 0),
      avg_power_kw: currentYearData.length > 0 
        ? currentYearData.reduce((sum, log) => sum + log.power_kw, 0) / currentYearData.length 
        : 0
    };

    // Calculate monthly data
    const monthlyMap = new Map<string, {
      year: number;
      month: number;
      records: PowerLog[];
    }>();

    recentData.forEach(log => {
      const logDate = new Date(log.created);
      const key = `${logDate.getFullYear()}-${logDate.getMonth()}`;
      
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          year: logDate.getFullYear(),
          month: logDate.getMonth(),
          records: []
        });
      }
      monthlyMap.get(key)!.records.push(log);
    });

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const monthly_data = Array.from(monthlyMap.values())
      .map(({ year, month, records }) => {
        const total_hours = calculateTotalHoursByTransaction(records);
        const total_kwh = calculateTotalEnergyByTransaction(records);
        const max_power_kw = Math.max(...records.map(log => log.power_kw), 0);
        const avg_power_kw = records.length > 0 
          ? records.reduce((sum, log) => sum + log.power_kw, 0) / records.length 
          : 0;

        return {
          year,
          month,
          month_name: monthNames[month],
          total_records: records.length,
          total_hours,
          total_kwh,
          max_power_kw,
          avg_power_kw
        };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });

    // Calculate hourly distribution (0-23 hours)
    const hourly_distribution = new Array(24).fill(0);
    recentData.forEach(log => {
      const logDate = new Date(log.created);
      const hour = logDate.getHours();
      hourly_distribution[hour] += log.power_kw;
    });

    setAnalytics({
      current_year_summary: currentYearSummary,
      monthly_data,
      hourly_distribution
    });
  };

  const calculateTotalHoursByTransaction = (logs: PowerLog[]): number => {
    // Group logs by charge_transaction_id and calculate duration for each transaction
    const transactionMap = new Map<number, PowerLog[]>();
    
    logs.forEach(log => {
      if (!transactionMap.has(log.charge_transaction_id)) {
        transactionMap.set(log.charge_transaction_id, []);
      }
      transactionMap.get(log.charge_transaction_id)!.push(log);
    });

    let totalHours = 0;
    transactionMap.forEach(transactionLogs => {
      if (transactionLogs.length > 1) {
        // Sort by created time
        transactionLogs.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
        
        const startTime = new Date(transactionLogs[0].created);
        const endTime = new Date(transactionLogs[transactionLogs.length - 1].created);
        
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        
        totalHours += durationHours;
      }
    });

    return totalHours;
  };

  const calculateTotalEnergyByTransaction = (logs: PowerLog[]): number => {
    // Sum up all energy values
    return logs.reduce((sum, log) => sum + (log.energy_kwh || 0), 0);
  };

  const formatKWh = (value: number | string) => `${Number(value).toFixed(2)} kWh`;
  const formatKW = (value: number | string) => `${Number(value).toFixed(2)} kW`;

  const chartConfig = {
    data: analytics?.hourly_distribution.map((value, hour) => ({
      hour: `${hour}:00`,
      energy: value
    })) || [],
    xField: 'hour',
    yField: 'energy',
    label: {
      position: 'middle',
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
    },
    meta: {
      energy: {
        alias: 'Energy (kWh)',
      },
    },
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: isMobile ? '20px' : '50px' }}>
        <Spin size="large" />
        <p>Loading PowerLog data...</p>
      </div>
    );
  }

  if (!analytics) {
    return <div>No data available</div>;
  }

  return (
    <div>
      <Title level={isMobile ? 4 : 3} style={{ marginTop: 24, marginBottom: 16 }}>Current Year ({new Date().getFullYear()})</Title>
      
      {/* Current Year Summary */}
      <Row gutter={isMobile ? 8 : 16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size={isMobile ? "small" : "default"}>
            <Statistic
              title={isMobile ? "Hours" : "Total Hours Charged"}
              value={analytics.current_year_summary.total_hours}
              prefix={<ClockCircleOutlined />}
              formatter={(value: number | string) => `${Number(value).toFixed(1)}h`}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size={isMobile ? "small" : "default"}>
            <Statistic
              title={isMobile ? "Energy" : "Total Energy"}
              value={analytics.current_year_summary.total_kwh}
              prefix={<ThunderboltOutlined />}
              formatter={formatKWh}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size={isMobile ? "small" : "default"}>
            <Statistic
              title={isMobile ? "Max Power" : "Max Power"}
              value={analytics.current_year_summary.max_power_kw}
              prefix={<FireOutlined />}
              formatter={formatKW}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size={isMobile ? "small" : "default"}>
            <Statistic
              title={isMobile ? "Avg Power" : "Average Power"}
              value={analytics.current_year_summary.avg_power_kw}
              prefix={<FireOutlined />}
              formatter={formatKW}
            />
          </Card>
        </Col>
      </Row>

      {/* Hourly Distribution Chart */}
      <Card title="Hourly Energy Distribution" style={{ marginBottom: 24 }}>
        <div style={{ height: isMobile ? 200 : 300 }}>
          <Column {...chartConfig} />
        </div>
      </Card>

      {/* Monthly Cards */}
      <Title level={isMobile ? 4 : 3}>Last 12 Months</Title>
      <Row gutter={[isMobile ? 8 : 16, isMobile ? 8 : 16]}>
        {analytics.monthly_data.map((monthData) => (
          <Col xs={24} sm={12} md={8} lg={6} key={`${monthData.year}-${monthData.month}`}>
            <Card 
              title={`${monthData.month_name} ${monthData.year}`}
              size="small"
              hoverable
            >
              <Statistic
                title="Hours Charged"
                value={monthData.total_hours}
                prefix={<ClockCircleOutlined />}
                formatter={(value: number | string) => `${Number(value).toFixed(1)}h`}
                style={{ marginBottom: 8 }}
              />
              <Statistic
                title="Energy"
                value={monthData.total_kwh}
                prefix={<ThunderboltOutlined />}
                formatter={formatKWh}
                style={{ marginBottom: 8 }}
              />
              <Statistic
                title="Max Power"
                value={monthData.max_power_kw}
                prefix={<FireOutlined />}
                formatter={formatKW}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default PowerLogs;
