import { API_BASE_URL } from '../config';

export interface PeriodSummary {
  total_records: number;
  total_hours: number;
  total_kwh: number;
  max_power_kw: number;
  avg_power_kw: number;
}

export interface MonthSummary extends PeriodSummary {
  year: number;
  /** 1 is January. */
  month: number;
  month_name: string;
}

export interface HourlyYear {
  year: number;
  /** 24 values: the kWh charged in each hour of the day (Dutch time) during the year. */
  hourly_kwh: number[];
}

export interface PowerLogAnalytics {
  current_year_summary: PeriodSummary;
  /** The last twelve months, newest first. */
  monthly_data: MonthSummary[];
  /** The last three years with logs, oldest first. */
  hourly_by_year: HourlyYear[];
}

export const getPowerLogAnalytics = async (): Promise<PowerLogAnalytics> => {
  const response = await fetch(`${API_BASE_URL}/power-logs/analytics`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch PowerLog data');
  }

  return response.json();
};
