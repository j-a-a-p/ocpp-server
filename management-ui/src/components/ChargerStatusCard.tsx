import { useEffect, useState } from "react";
import { Card, Col, Flex, Row, Statistic, Tag, theme, Typography } from "antd";
import { CheckCircleFilled, DisconnectOutlined, SettingOutlined, ThunderboltFilled } from "@ant-design/icons";

const { Text, Title } = Typography;

interface MeterValues {
  timestamp: string;
  connectorId: number;
  transactionId: number;
  context: string;
  data: {
    "Current.Offered": number;
    "Current.Import.L1": number;
    "Current.Import.L2": number;
    "Current.Import.L3": number;
    "Voltage.L1": number;
    "Voltage.L2": number;
    "Voltage.L3": number;
    "Energy.Active.Import.Register": number;
    "Power.Active.Import": number;
  };
  chargingProfile?: {
    name: string;
    currentMaxPower: number;
  };
}

type StationStatus = "available" | "charging" | "unknown";

const FRESH_WINDOW_MS = 2 * 60 * 1000;

const ChargerStatusCard: React.FC = () => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [meterValues, setMeterValues] = useState<MeterValues | null>(null);
  const [stationStatus, setStationStatus] = useState<StationStatus>("unknown");
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchMeterValues = async () => {
      try {
        const response = await fetch("/meter_values.json", { cache: "no-store" });
        if (cancelled) return;
        if (response.ok) {
          const data: MeterValues = await response.json();
          if (cancelled) return;
          setMeterValues(data);
          setLastUpdateTime(new Date());
          setStationStatus(Date.now() - new Date(data.timestamp).getTime() < FRESH_WINDOW_MS ? "charging" : "available");
        } else {
          setStationStatus("unknown");
        }
      } catch (error) {
        console.error("Error fetching meter values:", error);
        if (!cancelled) setStationStatus("unknown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMeterValues();
    const interval = setInterval(fetchMeterValues, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const appearance = {
    charging: {
      color: token.colorPrimary,
      background: token.colorPrimaryBg,
      icon: <ThunderboltFilled />,
      title: "Charging",
      description: "A charging session is in progress.",
    },
    available: {
      color: token.colorSuccess,
      background: token.colorSuccessBg,
      icon: <CheckCircleFilled />,
      title: "Available",
      description: "The charger is idle and ready for the next session.",
    },
    unknown: {
      color: token.colorTextTertiary,
      background: token.colorFillSecondary,
      icon: <DisconnectOutlined />,
      title: "Unknown",
      description: "There is no data from the charger.",
    },
  }[stationStatus];

  return (
    <Card
      title="Charger status"
      loading={loading}
      style={{ height: "100%" }}
      extra={
        lastUpdateTime && (
          <Flex align="center" gap={8}>
            {stationStatus === "charging" && <span className="live-dot" style={{ color: appearance.color }} />}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Updated {lastUpdateTime.toLocaleTimeString()}
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

      {meterValues && (
        <Row gutter={16} style={{ marginTop: 24 }}>
          <Col span={12}>
            <Statistic
              title="Current power"
              value={(stationStatus === "charging" ? meterValues.data["Power.Active.Import"] : 0).toFixed(2)}
              suffix="kW"
              styles={{ content: { fontSize: 20, fontWeight: 600 } }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Energy imported"
              value={(meterValues.data["Energy.Active.Import.Register"] || 0).toFixed(2)}
              suffix="kWh"
              styles={{ content: { fontSize: 20, fontWeight: 600 } }}
            />
          </Col>
        </Row>
      )}

      {meterValues?.chargingProfile && (
        <Flex align="center" gap={8} wrap style={{ marginTop: 20 }}>
          <SettingOutlined style={{ color: token.colorTextSecondary }} />
          <Text type="secondary">Charging profile</Text>
          <Tag color="processing">{meterValues.chargingProfile.name}</Tag>
          <Text type="secondary">limited to</Text>
          <Text strong>{meterValues.chargingProfile.currentMaxPower.toFixed(1)} A</Text>
        </Flex>
      )}
    </Card>
  );
};

export default ChargerStatusCard;
