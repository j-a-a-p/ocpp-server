import { useEffect, useState } from "react";
import { Alert, Card, Col, Empty, Flex, Row, Segmented, Spin, Table, Tag, theme } from "antd";
import type { TableColumnsType } from "antd";
import { ClockCircleOutlined, DisconnectOutlined, WifiOutlined } from "@ant-design/icons";
import StatTile from "./components/StatTile";
import StationTimeline from "./components/StationTimeline";
import { getStations, Station, StationOverview } from "./services/stationService";
import { formatInteger, formatNumber } from "./utils/format";

const RANGES = [
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 24 * 7 },
  { label: "30 days", value: 24 * 30 },
];

// The stations send a heartbeat every 30 seconds, so this is quick enough to see one drop out.
const REFRESH_MS = 15_000;

// The deploy script opens a websocket under this id. It is not a charging station.
const HIDDEN_STATION_IDS = new Set(["deploy-healthcheck"]);

const Stations: React.FC = () => {
  const { token } = theme.useToken();
  const [hours, setHours] = useState<number>(RANGES[0].value);
  const [overview, setOverview] = useState<StationOverview | null>(null);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let current = true;
    const load = () =>
      getStations(hours)
        .then((data) => {
          if (!current) return;
          setOverview(data);
          setFailed(false);
        })
        .catch((error) => {
          console.error("Failed to load the stations:", error);
          if (current) setFailed(true);
        });

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [hours]);

  const error = failed && (
    <Alert type="error" showIcon title="The stations could not be loaded. Trying again..." />
  );

  if (!overview) {
    return failed ? (
      <Flex vertical gap={16}>
        {error}
        <Card>
          <Empty description="No station data" />
        </Card>
      </Flex>
    ) : (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  // The answer for another window is on its way after a change of the range.
  const switching = overview.window_hours !== hours;
  const stations = overview.stations.filter((station) => !HIDDEN_STATION_IDS.has(station.station_id));
  const online = stations.filter((station) => station.online).length;
  const offline = stations.length - online;
  const uptimes = stations.flatMap((station) => (station.uptime_percent === null ? [] : [station.uptime_percent]));
  const averageUptime = uptimes.length ? uptimes.reduce((sum, uptime) => sum + uptime, 0) / uptimes.length : null;

  const columns: TableColumnsType<Station> = [
    { title: "Station", dataIndex: "station_id", key: "station_id" },
    {
      title: "Status",
      key: "status",
      render: (_, station) => (station.online ? <Tag color="success">Online</Tag> : <Tag color="error">Offline</Tag>),
    },
    {
      title: "Uptime",
      key: "uptime",
      align: "right",
      render: (_, station) => (station.uptime_percent === null ? "-" : `${formatNumber(station.uptime_percent, 1)}%`),
    },
    {
      title: "Connections",
      dataIndex: "connections",
      key: "connections",
      align: "right",
      render: (value: number) => formatInteger(value),
    },
  ];

  const windowLabel = RANGES.find((range) => range.value === overview.window_hours)?.label ?? `${overview.window_hours} hours`;

  return (
    <Flex vertical gap={16}>
      {error}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <StatTile
            title="Online now"
            value={online}
            icon={<WifiOutlined />}
            color={token.colorSuccess}
            background={token.colorSuccessBg}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatTile
            title="Offline"
            value={offline}
            icon={<DisconnectOutlined />}
            color={offline ? token.colorError : token.colorTextSecondary}
            background={offline ? token.colorErrorBg : token.colorFillTertiary}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatTile
            title={`Average uptime (${windowLabel})`}
            value={averageUptime ?? 0}
            formatter={(value) => (averageUptime === null ? "-" : `${formatNumber(value, 1)}%`)}
            icon={<ClockCircleOutlined />}
          />
        </Col>
      </Row>

      {stations.length === 0 ? (
        <Card>
          <Empty description="No charging station has connected yet" />
        </Card>
      ) : (
        <>
          <Card title="Stations">
            <Table<Station>
              rowKey="station_id"
              size="small"
              columns={columns}
              dataSource={stations}
              pagination={false}
              loading={switching}
              scroll={{ x: "max-content" }}
            />
          </Card>

          <Card
            title="Online timeline"
            loading={switching}
            extra={<Segmented options={RANGES} value={hours} onChange={(value) => setHours(Number(value))} />}
          >
            <StationTimeline stations={stations} windowStart={overview.window_start} windowEnd={overview.generated_at} />
          </Card>
        </>
      )}
    </Flex>
  );
};

export default Stations;
