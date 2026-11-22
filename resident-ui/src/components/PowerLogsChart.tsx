import { Line } from "@ant-design/charts";
import { Flex, Statistic, theme } from "antd";
import type { PowerLog } from "../services/chargeTransactionService";
import { useThemeMode } from "../theme/themeContext";
import { formatEuro, formatInteger, formatNumber } from "../utils/format";
import { runningTotals } from "../utils/energy";

interface PowerLogsChartProps {
  powerLogs: PowerLog[];
  transactionId: number;
}

const PowerLogsChart: React.FC<PowerLogsChartProps> = ({ powerLogs, transactionId }) => {
  const { token } = theme.useToken();
  const { isDark } = useThemeMode();

  // The energy and the cost so far, so the line only goes up and the tooltip shows what the session cost up to that moment.
  const totals = runningTotals(powerLogs);
  const first = totals[0];
  const last = totals[totals.length - 1];

  const data = totals.map(({ time, energy, cost }) => ({
    time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    energy,
    cost,
  }));

  const summary = [
    { title: "Energy", value: formatNumber(last.energy), suffix: "kWh" },
    { title: "Max power", value: formatNumber(Math.max(...totals.map(({ log }) => log.power_kw))), suffix: "kW" },
    {
      title: "Duration",
      value: formatInteger(Math.round((last.time.getTime() - first.time.getTime()) / 60000)),
      suffix: "min",
    },
    { title: "Cost", value: formatEuro(last.cost) },
  ];

  return (
    <div style={{ padding: "8px 8px 16px" }} aria-label={`Energy over time for session ${transactionId}`}>
      <Line
        data={data}
        xField="time"
        yField="energy"
        height={220}
        autoFit
        theme={isDark ? "classicDark" : "classic"}
        shapeField="smooth"
        style={{ stroke: token.colorPrimary, lineWidth: 2 }}
        axis={{
          x: { title: false, labelAutoHide: true },
          y: { title: "kWh", labelFormatter: (value: number) => formatNumber(value, 1) },
        }}
        tooltip={{
          title: "time",
          items: [
            { channel: "y", name: "Energy", valueFormatter: (value: number) => `${formatNumber(value)} kWh` },
            { field: "cost", name: "Cost so far", valueFormatter: (value: number) => formatEuro(value) },
          ],
        }}
      />
      <Flex gap={32} wrap justify="center" style={{ marginTop: 8 }}>
        {summary.map((item) => (
          <Statistic
            key={item.title}
            title={item.title}
            value={item.value}
            suffix={item.suffix}
            styles={{ content: { fontSize: 16, fontWeight: 600 } }}
          />
        ))}
      </Flex>
    </div>
  );
};

export default PowerLogsChart;
