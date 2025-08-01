import { API_BASE_URL } from '../config';

export interface ChargeTransaction {
  id: number;
  station_id: string;
  rfid: string;
  created: string;
  final_energy_kwh: number;
  resident_name: string;
}

export interface MonthlyData {
  year: number;
  month: number;
  month_display: string;
  resident_name: string;
  total_energy: number;
  transaction_count: number;
}

export interface YearlySummary {
  year: number;
  resident_name: string;
  total_energy: number;
  transaction_count: number;
}

export interface ChargeReportData {
  monthly_data: MonthlyData[];
  yearly_summaries: YearlySummary[];
}

export const getAllChargeTransactions = async (): Promise<ChargeTransaction[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/charge-transactions/all`, {
      credentials: 'include', // This will send the auth_token cookie
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching charge transactions:', error);
    throw error;
  }
}; 