import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Spin, message, Typography } from "antd";
import { Column } from "@ant-design/charts";
import { getPowerLogs, PowerLog } from "./services/powerLogService";
import { ThunderboltOutlined, ClockCircleOutlined, FireOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface AnalyticsData {
  current_year_summary: {
    total_records: number;
    total_kwh: number;
    max_power_kw: number;
    avg_power_kw: number;
  };
  monthly_data: Array<{
    year: number;
    month: number;
    month_name: string;
    total_records: number;
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
      total_kwh: currentYearData.reduce((sum, log) => sum + log.energy_kwh, 0),
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
        total_kwh: records.reduce((sum, log) => sum + log.energy_kwh, 0),
        max_power_kw: Math.max(...records.map(log => log.power_kw), 0),
        avg_power_kw: records.length > 0 
          ? records.reduce((sum, log) => sum + log.power_kw, 0) / records.length 
          : 0
      }))
      .sort((a, b) => b.year - a.year || b.month - a.month);

    // Calculate hourly distribution for current year
    const hourlyDistribution = new Array(24).fill(0);
    currentYearData.forEach(log => {
      const logDate = new Date(log.created);
      const hour = logDate.getHours();
      hourlyDistribution[hour] += log.energy_kwh;
    });

    setAnalytics({
      current_year_summary: currentYearSummary,
      monthly_data: monthlyData,
      hourly_distribution: hourlyDistribution
    });
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
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${v} kWh`,
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
      
      {/* Current Year Summary */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Records (Current Year)"
              value={analytics.current_year_summary.total_records}
              prefix={<ClockCircleOutlined />}
              suffix="hours"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Energy (Current Year)"
              value={analytics.current_year_summary.total_kwh}
              prefix={<ThunderboltOutlined />}
              suffix="kWh"
              formatter={formatKWh}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Max Power (Current Year)"
              value={analytics.current_year_summary.max_power_kw}
              prefix={<FireOutlined />}
              suffix="kW"
              formatter={formatKW}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Average Power (Current Year)"
              value={analytics.current_year_summary.avg_power_kw}
              prefix={<FireOutlined />}
              suffix="kW"
              formatter={formatKW}
            />
          </Card>
        </Col>
      </Row>

      {/* Hourly Distribution Chart */}
      <Card title="Hourly Energy Distribution (Current Year)" style={{ marginBottom: 24 }}>
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
                title="Hours"
                value={monthData.total_records}
                prefix={<ClockCircleOutlined />}
                suffix="h"
                style={{ marginBottom: 8 }}
              />
              <Statistic
                title="Energy"
                value={monthData.total_kwh}
                prefix={<ThunderboltOutlined />}
                suffix="kWh"
                formatter={formatKWh}
                style={{ marginBottom: 8 }}
              />
              <Statistic
                title="Max Power"
                value={monthData.max_power_kw}
                prefix={<FireOutlined />}
                suffix="kW"
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
