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

    const monthlyData = Array.from(monthlyMap.values())
      .map(({ year, month, records }) => ({
        year,
        month,
        month_name: new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long' }),
        total_records: records.length,
        total_hours: calculateTotalHoursByTransaction(records),
        total_kwh: calculateTotalEnergyByTransaction(records),
        max_power_kw: Math.max(...records.map(log => log.power_kw), 0),
        avg_power_kw: records.length > 0 
          ? records.reduce((sum, log) => sum + log.power_kw, 0) / records.length 
          : 0
      }))
      .sort((a, b) => b.year - a.year || b.month - a.month);

    // Calculate hourly distribution for current year
    const hourlyDistribution = new Array(24).fill(0);
    
    // Group current year data by hour and then by transaction
    const hourlyMap = new Map<number, PowerLog[]>();
    currentYearData.forEach(log => {
      const logDate = new Date(log.created);
      const hour = logDate.getHours();
      
      if (!hourlyMap.has(hour)) {
        hourlyMap.set(hour, []);
      }
      hourlyMap.get(hour)!.push(log);
    });

    // Calculate energy consumption for each hour
    hourlyMap.forEach((records, hour) => {
      hourlyDistribution[hour] = calculateTotalEnergyByTransaction(records);
    });

    setAnalytics({
      current_year_summary: currentYearSummary,
      monthly_data: monthlyData,
      hourly_distribution: hourlyDistribution
    });
  };

  // Helper function to calculate total hours charged by grouping by ChargeTransaction ID
  const calculateTotalHoursByTransaction = (records: PowerLog[]): number => {
    if (records.length === 0) return 0;
    
    // Group records by charge_transaction_id
    const transactionMap = new Map<number, PowerLog[]>();
    records.forEach(log => {
      if (!transactionMap.has(log.charge_transaction_id)) {
        transactionMap.set(log.charge_transaction_id, []);
      }
      transactionMap.get(log.charge_transaction_id)!.push(log);
    });
    
    // Calculate hours for each transaction and sum them up
    let totalHours = 0;
    transactionMap.forEach((transactionRecords) => {
      totalHours += calculateTransactionHours(transactionRecords);
    });
    
    return totalHours;
  };

  // Helper function to calculate hours for a single transaction
  const calculateTransactionHours = (records: PowerLog[]): number => {
    if (records.length === 0) return 0;
    if (records.length === 1) return 0; // Single record, no duration to calculate
    
    // Sort records by creation time
    const sortedRecords = [...records].sort((a, b) => 
      new Date(a.created).getTime() - new Date(b.created).getTime()
    );
    
    // Calculate duration between first and last record
    const firstRecord = sortedRecords[0];
    const lastRecord = sortedRecords[sortedRecords.length - 1];
    
    const startTime = new Date(firstRecord.created).getTime();
    const endTime = new Date(lastRecord.created).getTime();
    
    // Convert milliseconds to hours
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);
    
    // Return 0 if duration is negative (data inconsistency) or very small
    return durationHours > 0 ? durationHours : 0;
  };

  // Helper function to calculate total energy consumption by grouping by ChargeTransaction ID
  const calculateTotalEnergyByTransaction = (records: PowerLog[]): number => {
    if (records.length === 0) return 0;
    
    // Group records by charge_transaction_id
    const transactionMap = new Map<number, PowerLog[]>();
    records.forEach(log => {
      if (!transactionMap.has(log.charge_transaction_id)) {
        transactionMap.set(log.charge_transaction_id, []);
      }
      transactionMap.get(log.charge_transaction_id)!.push(log);
    });
    
    // Calculate energy for each transaction and sum them up
    let totalEnergy = 0;
    transactionMap.forEach((transactionRecords) => {
      totalEnergy += calculateTotalEnergy(transactionRecords);
    });
    
    return totalEnergy;
  };

  // Helper function to calculate total energy consumption from time series data
  const calculateTotalEnergy = (records: PowerLog[]): number => {
    if (records.length === 0) return 0;
    if (records.length === 1) return 0; // Single record, no delta to calculate
    
    // Sort records by creation time
    const sortedRecords = [...records].sort((a, b) => 
      new Date(a.created).getTime() - new Date(b.created).getTime()
    );
    
    // Calculate delta between first and last record
    const firstRecord = sortedRecords[0];
    const lastRecord = sortedRecords[sortedRecords.length - 1];
    
    // Energy consumption is the difference between final and initial energy values
    const delta = lastRecord.energy_kwh - firstRecord.energy_kwh;
    
    // Return 0 if delta is negative (data inconsistency) or very small
    return delta > 0 ? delta : 0;
  };

  const formatKWh = (value: number | string) => `${Number(value).toFixed(1)} kWh`;
  const formatKW = (value: number | string) => `${Number(value).toFixed(1)} kW`;

  const prepareHourlyChartData = (hourlyDistribution: number[]) => {
    return hourlyDistribution.map((kwh, hour) => ({
      hour: `${hour}:00`,
      kwh: kwh
    }));
  };

  const chartConfig = {
    data: analytics ? prepareHourlyChartData(analytics.hourly_distribution) : [],
    xField: 'hour',
    yField: 'kwh',
    label: {
      position: 'middle',
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
      formatter: (v: number | string) => `${Number(v).toFixed(1)} kWh`,
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${Number(v).toFixed(1)} kWh`,
      },
    },
    meta: {
      kwh: {
        alias: 'Energy (kWh)',
      },
    },
    color: '#1890ff',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>Loading PowerLog data...</div>
      </div>
    );
  }

  if (!analytics) {
    return <div>No data available</div>;
  }

  return (
    <div>
      <Title level={2}>PowerLog Analytics</Title>
      <Title level={3} style={{ marginTop: 24, marginBottom: 16 }}>Current Year ({new Date().getFullYear()})</Title>
      
      {/* Current Year Summary */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Hours Charged"
              value={analytics.current_year_summary.total_hours}
              prefix={<ClockCircleOutlined />}
              formatter={(value: number | string) => `${Number(value).toFixed(1)}h`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Energy"
              value={analytics.current_year_summary.total_kwh}
              prefix={<ThunderboltOutlined />}
              formatter={formatKWh}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Max Power"
              value={analytics.current_year_summary.max_power_kw}
              prefix={<FireOutlined />}
              formatter={formatKW}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Average Power"
              value={analytics.current_year_summary.avg_power_kw}
              prefix={<FireOutlined />}
              formatter={formatKW}
            />
          </Card>
        </Col>
      </Row>

      {/* Hourly Distribution Chart */}
      <Card title="Hourly Energy Distribution" style={{ marginBottom: 24 }}>
        <div style={{ height: 300 }}>
          <Column {...chartConfig} />
        </div>
      </Card>

      {/* Monthly Cards */}
      <Title level={3}>Last 12 Months</Title>
      <Row gutter={[16, 16]}>
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
