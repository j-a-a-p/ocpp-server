import type { PowerLog } from "../services/powerLogService";
import { parseUtc } from "./dates";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface PeriodSummary {
  total_records: number;
  total_hours: number;
  total_kwh: number;
  max_power_kw: number;
  avg_power_kw: number;
}

export interface MonthSummary extends PeriodSummary {
  year: number;
  month: number;
  month_name: string;
}

export interface AnalyticsData {
  current_year_summary: PeriodSummary;
  monthly_data: MonthSummary[];
  hourly_distribution: number[];
}

export interface TimedLog extends PowerLog {
  time: Date;
  delta_kwh: number;
}

const groupByTransaction = <T extends PowerLog>(logs: T[]) => {
  const byTransaction = new Map<number, T[]>();
  logs.forEach((log) => {
    const group = byTransaction.get(log.charge_transaction_id) ?? [];
    group.push(log);
    byTransaction.set(log.charge_transaction_id, group);
  });
  return byTransaction;
};

// energy_kwh is the session's running meter total, so a log contributes the increase since the previous log.
export const withEnergyDeltas = (logs: PowerLog[]): TimedLog[] => {
  const result: TimedLog[] = [];
  groupByTransaction(logs).forEach((transactionLogs) => {
    const sorted = transactionLogs
      .map((log) => ({ ...log, time: parseUtc(log.created), delta_kwh: 0 }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
    let previous = 0;
    sorted.forEach((log) => {
      log.delta_kwh = Math.max(0, (log.energy_kwh || 0) - previous);
      previous = log.energy_kwh || 0;
      result.push(log);
    });
  });
  return result;
};

const totalHoursByTransaction = (logs: TimedLog[]): number => {
  let totalHours = 0;
  groupByTransaction(logs).forEach((transactionLogs) => {
    if (transactionLogs.length > 1) {
      const times = transactionLogs.map((log) => log.time.getTime());
      totalHours += (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60);
    }
  });
  return totalHours;
};

export const summarize = (logs: TimedLog[]): PeriodSummary => ({
  total_records: logs.length,
  total_hours: totalHoursByTransaction(logs),
  total_kwh: logs.reduce((sum, log) => sum + log.delta_kwh, 0),
  max_power_kw: Math.max(...logs.map((log) => log.power_kw), 0),
  avg_power_kw: logs.length > 0 ? logs.reduce((sum, log) => sum + log.power_kw, 0) / logs.length : 0,
});

export const calculateAnalytics = (powerLogs: PowerLog[]): AnalyticsData => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const logs = withEnergyDeltas(powerLogs);
  const recentData = logs.filter((log) => log.time >= twelveMonthsAgo);
  const currentYearData = logs.filter((log) => log.time.getFullYear() === currentYear);

  const monthlyMap = new Map<string, { year: number; month: number; records: TimedLog[] }>();
  recentData.forEach((log) => {
    const key = `${log.time.getFullYear()}-${log.time.getMonth()}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { year: log.time.getFullYear(), month: log.time.getMonth(), records: [] });
    }
    monthlyMap.get(key)!.records.push(log);
  });

  const monthly_data = Array.from(monthlyMap.values())
    .map(({ year, month, records }) => ({ year, month, month_name: MONTH_NAMES[month], ...summarize(records) }))
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));

  const hourly_distribution = new Array(24).fill(0);
  recentData.forEach((log) => {
    hourly_distribution[log.time.getHours()] += log.power_kw;
  });

  return { current_year_summary: summarize(currentYearData), monthly_data, hourly_distribution };
};