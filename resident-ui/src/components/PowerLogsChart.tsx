import { Line } from "@ant-design/charts";
import { Flex, Statistic, theme } from "antd";
import type { PowerLog } from "../services/chargeTransactionService";
import { useThemeMode } from "../theme/themeContext";
import { formatEuro } from "../utils/format";

interface PowerLogsChartProps {
  powerLogs: PowerLog[];
  transactionId: number;
}

const PowerLogsChart: React.FC<PowerLogsChartProps> = ({ powerLogs, transactionId }) => {
  const { token } = theme.useToken();
  const { isDark } = useThemeMode();

  const sortedLogs = [...powerLogs].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  const first = sortedLogs[0];
  const last = sortedLogs[sortedLogs.length - 1];

  const data = sortedLogs.map((log) => ({
    time: new Date(log.created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    energy: log.energy_kwh,
    cost: log.delta_power_cost || 0,
  }));

  const summary = [
    { title: "Energy", value: last.energy_kwh.toFixed(2), suffix: "kWh" },
    { title: "Max power", value: Math.max(...sortedLogs.map((log) => log.power_kw)).toFixed(2), suffix: "kW" },
    {
      title: "Duration",
      value: String(Math.round((new Date(last.created).getTime() - new Date(first.created).getTime()) / 60000)),
      suffix: "min",
    },
    {
      title: "Cost",
      value: formatEuro(sortedLogs.reduce((sum, log) => sum + (log.delta_power_cost || 0), 0)),
    },
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
          y: { title: "kWh", labelFormatter: (value: number) => value.toFixed(1) },
        }}
        tooltip={{
          title: "time",
          items: [
            { channel: "y", name: "Energy", valueFormatter: (value: number) => `${value.toFixed(2)} kWh` },
            { field: "cost", name: "Cost", valueFormatter: (value: number) => `€${value.toFixed(2)}` },
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
