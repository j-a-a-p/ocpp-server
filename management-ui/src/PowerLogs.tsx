import { useEffect, useState } from "react";
import { App, Card, Col, Empty, Flex, Row, Spin, Statistic, theme, Typography } from "antd";
import { Column } from "@ant-design/charts";
import { getPowerLogAnalytics, PowerLogAnalytics } from "./services/powerLogService";
import { ThunderboltOutlined, ClockCircleOutlined, FireOutlined, DashboardOutlined } from "@ant-design/icons";
import StatTile from "./components/StatTile";
import { useThemeMode } from "./theme/themeContext";
import { formatKwh, formatNumber } from "./utils/format";

const { Title } = Typography;

const formatKW = (value: number | string) => `${formatNumber(value)} kW`;
const formatHours = (value: number | string) => `${formatNumber(value, 1)} h`;

const PowerLogs: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { isDark } = useThemeMode();
  const [analytics, setAnalytics] = useState<PowerLogAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    getPowerLogAnalytics()
      .then(setAnalytics)
      .catch((error) => {
        console.error("Failed to load PowerLog data:", error);
        message.error("Failed to load PowerLog data.");
      })
      .finally(() => setLoading(false));
  }, [message]);

  if (loading) {
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!analytics || analytics.hourly_by_year.length === 0) {
    return (
      <Card>
        <Empty description="No power log data yet" />
      </Card>
    );
  }

  const summary = analytics.current_year_summary;
  // A string year, so the chart treats the years as separate series and not as a number scale.
  const hourlyData = analytics.hourly_by_year.flatMap(({ year, hourly_kwh }) =>
    hourly_kwh.map((energy, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, year: String(year), energy }))
  );

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
            formatter={(value) => formatKwh(value)}
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

      <Card title="Hourly energy distribution (last 3 years)">
        <Column
          data={hourlyData}
          xField="hour"
          yField="energy"
          colorField="year"
          group
          height={300}
          autoFit
          theme={isDark ? "classicDark" : "classic"}
          style={{ radiusTopLeft: 4, radiusTopRight: 4 }}
          axis={{
            x: { title: false, labelAutoHide: true },
            y: { title: "kWh", labelFormatter: (value: number) => formatNumber(value, 0) },
          }}
          tooltip={{ items: [(datum: { year: string; energy: number }) => ({ name: datum.year, value: formatKwh(datum.energy, 1) })] }}
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
                  <Statistic title="Energy" value={month.total_kwh} formatter={(value) => formatKwh(value)} styles={{ content: { fontSize: 18 } }} />
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
