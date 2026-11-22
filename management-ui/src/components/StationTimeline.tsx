import { Flex, theme, Typography } from "antd";
import dayjs from "dayjs";
import type { Station } from "../services/stationService";
import { formatNumber } from "../utils/format";
import { parseUtc } from "../utils/dates";

const { Text } = Typography;

const LABEL_WIDTH = 120;
const TICKS = [0, 25, 50, 75, 100];
// Up to a day and a half the axis shows clock times, beyond that dates.
const CLOCK_TIMES_UP_TO_MS = 36 * 3600 * 1000;

const moment = (value: string) => dayjs(parseUtc(value)).format("D MMM HH:mm");

interface StationTimelineProps {
  stations: Station[];
  windowStart: string;
  windowEnd: string;
}

/** One bar per station over the window: green where it was online, red where it was not, grey before its first connection. */
const StationTimeline: React.FC<StationTimelineProps> = ({ stations, windowStart, windowEnd }) => {
  const { token } = theme.useToken();
  const start = parseUtc(windowStart).getTime();
  const span = parseUtc(windowEnd).getTime() - start;
  const percent = (value: string) => Math.min(100, Math.max(0, ((parseUtc(value).getTime() - start) / span) * 100));
  const tickLabel = (tick: number) => {
    const at = dayjs(start + (span * tick) / 100);
    return span <= CLOCK_TIMES_UP_TO_MS ? at.format("HH:mm") : at.format("D MMM");
  };

  const swatch = (color: string, label: string) => (
    <Flex align="center" gap={6} key={label}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
    </Flex>
  );

  return (
    <Flex vertical gap={10}>
      {stations.map((station) => (
        <Flex key={station.station_id} align="center" gap={12}>
          <Text strong ellipsis style={{ width: LABEL_WIDTH, flex: "none" }}>
            {station.station_id}
          </Text>
          <div
            role="img"
            aria-label={
              station.uptime_percent === null
                ? `${station.station_id}: no uptime yet`
                : `${station.station_id}: online ${formatNumber(station.uptime_percent, 1)}% of the time`
            }
            style={{ position: "relative", flex: 1, height: 20, borderRadius: 4, overflow: "hidden", background: token.colorFillSecondary }}
          >
            <div
              style={{ position: "absolute", top: 0, bottom: 0, right: 0, left: `${percent(station.first_seen)}%`, background: token.colorErrorBg }}
            />
            {station.online_periods.map((period) => (
              <div
                key={period.start}
                title={`Online ${moment(period.start)} - ${moment(period.end)}`}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  minWidth: 2,
                  left: `${percent(period.start)}%`,
                  width: `${percent(period.end) - percent(period.start)}%`,
                  background: token.colorSuccess,
                }}
              />
            ))}
          </div>
        </Flex>
      ))}

      <Flex gap={12} aria-hidden>
        <div style={{ width: LABEL_WIDTH, flex: "none" }} />
        <div style={{ position: "relative", flex: 1, height: 18 }}>
          {TICKS.map((tick) => (
            <Text
              key={tick}
              type="secondary"
              style={{
                position: "absolute",
                left: `${tick}%`,
                transform: tick === 0 ? undefined : tick === 100 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {tickLabel(tick)}
            </Text>
          ))}
        </div>
      </Flex>

      <Flex gap={16} wrap style={{ marginTop: 4 }}>
        {swatch(token.colorSuccess, "Online")}
        {swatch(token.colorErrorBg, "Offline")}
        {swatch(token.colorFillSecondary, "Before the first connection")}
      </Flex>
    </Flex>
  );
};

export default StationTimeline;
