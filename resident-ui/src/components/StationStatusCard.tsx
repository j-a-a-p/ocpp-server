import type { ReactNode } from "react";
import { Card, Col, Flex, Row, Statistic, theme, Typography } from "antd";
import { CheckCircleFilled, DisconnectOutlined, HourglassFilled, ThunderboltFilled } from "@ant-design/icons";
import type { MeterValues, StationState } from "../hooks/useStationStatus";
import { formatEuro, formatNumber } from "../utils/format";
import type { Tariff } from "../services/chargingCostService";

const { Text, Title } = Typography;

interface StationStatusCardProps {
  state: StationState;
  meterValues: MeterValues | null;
  lastUpdate: Date | null;
  loaded: boolean;
  rate: number | null;
  tariff?: Tariff | null;
}

interface Metric {
  title: string;
  value: string;
  suffix?: ReactNode;
}

const StationStatusCard: React.FC<StationStatusCardProps> = ({ state, meterValues, lastUpdate, loaded, rate, tariff }) => {
  const { token } = theme.useToken();

  const appearance = {
    available: {
      color: token.colorSuccess,
      background: token.colorSuccessBg,
      icon: <CheckCircleFilled />,
      title: "Available",
      description: "The charger is free. Tap your card to start charging.",
    },
    mine: {
      color: token.colorPrimary,
      background: token.colorPrimaryBg,
      icon: <ThunderboltFilled />,
      title: "Charging",
      description: "You are charging now.",
    },
    other: {
      color: token.colorWarning,
      background: token.colorWarningBg,
      icon: <HourglassFilled />,
      title: "In use",
      description: "Another resident is charging.",
    },
    unknown: {
      color: token.colorTextTertiary,
      background: token.colorFillSecondary,
      icon: <DisconnectOutlined />,
      title: "Unknown",
      description: "There is no recent data from the charger.",
    },
  }[state];

  const metrics: Metric[] = [];
  if (state === "mine" && meterValues) {
    metrics.push({ title: "Power", value: formatNumber(meterValues.data["Power.Active.Import"]), suffix: "kW" });
  }
  if ((state === "mine" || state === "other") && meterValues) {
    metrics.push({ title: "Energy", value: formatNumber(meterValues.data["Energy.Active.Import.Register"]), suffix: "kWh" });
  }
  if ((state === "mine" || state === "available") && rate !== null) {
    metrics.push({ title: "Rate", value: formatEuro(rate), suffix: tariff ? `/kWh · ${tariff}` : "/kWh" });
  }

  const live = state === "mine" || state === "other";

  return (
    <Card
      title="Station status"
      loading={!loaded}
      style={{ height: "100%" }}
      extra={
        lastUpdate && (
          <Flex align="center" gap={8}>
            {live && <span className="live-dot" style={{ color: appearance.color }} />}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Updated {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
          </Flex>
        )
      }
    >
      <Flex align="center" gap={16}>
        <span className="status-icon" style={{ color: appearance.color, background: appearance.background }}>
          {appearance.icon}
        </span>
        <div>
          <Title level={3} style={{ margin: 0, color: appearance.color }}>
            {appearance.title}
          </Title>
          <Text type="secondary">{appearance.description}</Text>
        </div>
      </Flex>

      {metrics.length > 0 && (
        <Row gutter={16} style={{ marginTop: 24 }}>
          {metrics.map((metric) => (
            <Col key={metric.title} span={24 / metrics.length}>
              <Statistic
                title={metric.title}
                value={metric.value}
                suffix={metric.suffix}
                styles={{ content: { fontSize: 20, fontWeight: 600 } }}
              />
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
};

export default StationStatusCard;
