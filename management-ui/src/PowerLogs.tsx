import { useEffect, useMemo, useState } from "react";
import { App, Card, Col, Empty, Flex, Row, Spin, Statistic, theme, Typography } from "antd";
import { Column } from "@ant-design/charts";
import { getPowerLogs, PowerLog } from "./services/powerLogService";
import { ThunderboltOutlined, ClockCircleOutlined, FireOutlined, DashboardOutlined } from "@ant-design/icons";
import StatTile from "./components/StatTile";
import { useThemeMode } from "./theme/themeContext";

const { Title } = Typography;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface PeriodSummary {
  total_records: number;
  total_hours: number;
  total_kwh: number;
  max_power_kw: number;
  avg_power_kw: number;
}

interface MonthSummary extends PeriodSummary {
  year: number;
  month: number;
  month_name: string;
}

interface AnalyticsData {
  current_year_summary: PeriodSummary;
  monthly_data: MonthSummary[];
  hourly_distribution: number[];
}

const totalHoursByTransaction = (logs: PowerLog[]): number => {
  const byTransaction = new Map<number, PowerLog[]>();
  logs.forEach((log) => {
    const group = byTransaction.get(log.charge_transaction_id) ?? [];
    group.push(log);
    byTransaction.set(log.charge_transaction_id, group);
  });

  let totalHours = 0;
  byTransaction.forEach((transactionLogs) => {
    if (transactionLogs.length > 1) {
      const times = transactionLogs.map((log) => new Date(log.created).getTime());
      totalHours += (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60);
    }
  });
  return totalHours;
};

const summarize = (logs: PowerLog[]): PeriodSummary => ({
  total_records: logs.length,
  total_hours: totalHoursByTransaction(logs),
  total_kwh: logs.reduce((sum, log) => sum + (log.energy_kwh || 0), 0),
  max_power_kw: Math.max(...logs.map((log) => log.power_kw), 0),
  avg_power_kw: logs.length > 0 ? logs.reduce((sum, log) => sum + log.power_kw, 0) / logs.length : 0,
});

const calculateAnalytics = (powerLogs: PowerLog[]): AnalyticsData => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const recentData = powerLogs.filter((log) => new Date(log.created) >= twelveMonthsAgo);
  const currentYearData = powerLogs.filter((log) => new Date(log.created).getFullYear() === currentYear);

  const monthlyMap = new Map<string, { year: number; month: number; records: PowerLog[] }>();
  recentData.forEach((log) => {
    const logDate = new Date(log.created);
    const key = `${logDate.getFullYear()}-${logDate.getMonth()}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { year: logDate.getFullYear(), month: logDate.getMonth(), records: [] });
    }
    monthlyMap.get(key)!.records.push(log);
  });

  const monthly_data = Array.from(monthlyMap.values())
    .map(({ year, month, records }) => ({ year, month, month_name: MONTH_NAMES[month], ...summarize(records) }))
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));

  const hourly_distribution = new Array(24).fill(0);
  recentData.forEach((log) => {
    hourly_distribution[new Date(log.created).getHours()] += log.power_kw;
  });

  return { current_year_summary: summarize(currentYearData), monthly_data, hourly_distribution };
};

const formatKWh = (value: number | string) => `${Number(value).toFixed(2)} kWh`;
const formatKW = (value: number | string) => `${Number(value).toFixed(2)} kW`;
const formatHours = (value: number | string) => `${Number(value).toFixed(1)} h`;

const PowerLogs: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { isDark } = useThemeMode();
  const [powerLogs, setPowerLogs] = useState<PowerLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    getPowerLogs(0, 10000)
      .then(setPowerLogs)
      .catch((error) => {
        console.error("Failed to load PowerLog data:", error);
        message.error("Failed to load PowerLog data.");
      })
      .finally(() => setLoading(false));
  }, [message]);

  const analytics = useMemo(() => (powerLogs.length > 0 ? calculateAnalytics(powerLogs) : null), [powerLogs]);

  if (loading) {
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <Empty description="No power log data yet" />
      </Card>
    );
  }

  const summary = analytics.current_year_summary;
  const hourlyData = analytics.hourly_distribution.map((value, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    energy: value,
  }));

  return (
    <Flex vertical gap={16}>
      <Title level={5} style={{ margin: 0 }}>
        Current year ({new Date().getFullYear()})
      </Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatTile title="Hours charged" value={summary.total_hours} formatter={formatHours} icon={<ClockCircleOutlined />} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatTile
            title="Total energy"
            value={summary.total_kwh}
            formatter={formatKWh}
            icon={<ThunderboltOutlined />}
            color={token.colorSuccess}
            background={token.colorSuccessBg}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatTile
            title="Max power"
            value={summary.max_power_kw}
            formatter={formatKW}
            icon={<FireOutlined />}
            color={token.colorError}
            background={token.colorErrorBg}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatTile
            title="Average power"
            value={summary.avg_power_kw}
            formatter={formatKW}
            icon={<DashboardOutlined />}
            color={token.colorWarning}
            background={token.colorWarningBg}
          />
        </Col>
      </Row>

      <Card title="Hourly power distribution (last 12 months)">
        <Column
          data={hourlyData}
          xField="hour"
          yField="energy"
          height={300}
          autoFit
          theme={isDark ? "classicDark" : "classic"}
          style={{ fill: token.colorPrimary, radiusTopLeft: 4, radiusTopRight: 4 }}
          axis={{
            x: { title: false, labelAutoHide: true },
            y: { title: "kW", labelFormatter: (value: number) => value.toFixed(0) },
          }}
          tooltip={{ items: [{ channel: "y", name: "Power", valueFormatter: (value: number) => `${value.toFixed(1)} kW` }] }}
        />
      </Card>

      <Title level={5} style={{ margin: "8px 0 0" }}>
        Last 12 months
      </Title>
      <Row gutter={[16, 16]}>
        {analytics.monthly_data.map((month) => (
          <Col xs={24} sm={12} lg={8} xxl={6} key={`${month.year}-${month.month}`}>
            <Card title={`${month.month_name} ${month.year}`} size="small">
              <Row gutter={[8, 12]}>
                <Col span={12}>
                  <Statistic title="Hours" value={month.total_hours} formatter={formatHours} styles={{ content: { fontSize: 18 } }} />
                </Col>
                <Col span={12}>
                  <Statistic title="Energy" value={month.total_kwh} formatter={formatKWh} styles={{ content: { fontSize: 18 } }} />
                </Col>
                <Col span={12}>
                  <Statistic title="Max power" value={month.max_power_kw} formatter={formatKW} styles={{ content: { fontSize: 18 } }} />
                </Col>
                <Col span={12}>
                  <Statistic title="Avg power" value={month.avg_power_kw} formatter={formatKW} styles={{ content: { fontSize: 18 } }} />
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>
    </Flex>
  );
};

export default PowerLogs;
