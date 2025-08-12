import React from 'react';
import { Line } from '@ant-design/charts';
import { PowerLog } from '../services/chargeTransactionService';
import { Card, Typography } from 'antd';

const { Text } = Typography;

interface PowerLogsChartProps {
  powerLogs: PowerLog[];
  transactionId: number;
}

const PowerLogsChart: React.FC<PowerLogsChartProps> = ({ powerLogs, transactionId }) => {
  if (!powerLogs || powerLogs.length < 2) {
    return (
      <Card size="small" style={{ margin: '8px 0' }}>
        <Text type="secondary">Insufficient power logs data for this transaction (need at least 2 data points).</Text>
      </Card>
    );
  }

  // Sort power logs by timestamp
  const sortedPowerLogs = [...powerLogs].sort((a, b) => 
    new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // Prepare data for the chart
  const chartData = sortedPowerLogs.map((log) => ({
    time: new Date(log.created).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }),
    energy: log.energy_kwh,
    power: log.power_kw,
    cost: log.delta_power_cost || 0,
    rate: log.kwh_rate || 0,
    timestamp: new Date(log.created).getTime(),
  }));

  const config = {
    data: chartData,
    xField: 'time',
    yField: 'energy',
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
      tickCount: 5, // Reduce number of ticks
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${Number(v).toFixed(2)} kWh`,
      },
      title: {
        text: 'Energy (kWh)',
      },
    },
    meta: {
      energy: {
        alias: 'Energy (kWh)',
      },
      time: {
        alias: 'Time (HH:MM)',
      },
    },
    color: '#1890ff',
    point: false, // Remove markers for cleaner look with many datapoints
    tooltip: {
      showCrosshairs: true,
      shared: true,
      formatter: (datum: { energy: number; cost: number; rate: number }) => {
        return [
          {
            name: 'Energy',
            value: `${datum.energy.toFixed(2)} kWh`,
          },
          {
            name: 'Cost',
            value: `€${datum.cost.toFixed(2)}`,
          },
          {
            name: 'Rate',
            value: `€${datum.rate.toFixed(4)}/kWh`,
          },
        ];
      },
      title: (datum: { time: string }) => `Time: ${datum.time}`,
    },
    height: 200,
    autoFit: true,
  };

  return (
    <Card 
      size="small" 
      style={{ margin: '8px 0' }}
      title={
        <Text strong>
          Energy Progress Over Time (Transaction #{transactionId})
        </Text>
      }
    >
      <div>
        <Line {...config} />
      </div>
      <div style={{ marginTop: '8px', textAlign: 'center' }}>
        <Text type="secondary">
          Total Energy: {sortedPowerLogs[sortedPowerLogs.length - 1]?.energy_kwh.toFixed(2)} kWh | 
          Max Power: {Math.max(...sortedPowerLogs.map(log => log.power_kw)).toFixed(2)} kW | 
          Duration: {sortedPowerLogs.length > 1 ? Math.round((new Date(sortedPowerLogs[sortedPowerLogs.length - 1]?.created).getTime() - new Date(sortedPowerLogs[0]?.created).getTime()) / (1000 * 60)) : 0} min | 
          Total Cost: €{sortedPowerLogs.reduce((sum, log) => sum + (log.delta_power_cost || 0), 0).toFixed(2)}
        </Text>
      </div>
    </Card>
  );
};

export default PowerLogsChart;
