import type { ReactNode } from "react";
import { Card, Flex, Statistic, theme } from "antd";

interface StatTileProps {
  title: ReactNode;
  value: number;
  icon: ReactNode;
  precision?: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
  formatter?: (value: number | string) => ReactNode;
  color?: string;
  background?: string;
  loading?: boolean;
}

const StatTile: React.FC<StatTileProps> = ({ title, value, icon, precision, prefix, suffix, formatter, color, background, loading }) => {
  const { token } = theme.useToken();
  const display = formatter ?? (precision !== undefined ? (v: number | string) => Number(v).toFixed(precision) : undefined);

  return (
    <Card size="small" style={{ height: "100%" }} styles={{ body: { padding: 16 } }}>
      <Flex align="center" gap={14}>
        <span
          className="status-icon"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            fontSize: 20,
            color: color ?? token.colorPrimary,
            background: background ?? token.colorPrimaryBg,
          }}
        >
          {icon}
        </span>
        <Statistic
          title={title}
          value={value}
          prefix={prefix}
          suffix={suffix}
          formatter={display}
          loading={loading}
          styles={{ content: { fontSize: 22, fontWeight: 600 } }}
        />
      </Flex>
    </Card>
  );
};

export default StatTile;
