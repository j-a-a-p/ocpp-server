import { API_BASE_URL } from '../config';
import type { Address } from '../utils/address';

/** The address the resident of the card lives at: the Charges page groups the charges by it. */
export interface ChargeTransaction extends Partial<Address> {
  id: number;
  station_id: string;
  rfid: string;
  created: string;
  /** The moment of the last measurement, empty when the charge has none. */
  ended?: string | null;
  final_energy_kwh: number;
  resident_name: string;
  card_name?: string | null;
  /** What the energy of the charge costs, at the price of the moment of each power log. */
  total_cost: number;
}

/** What is charged at one address in one month. */
export interface MonthlyData {
  year: number;
  month: number;
  month_display: string;
  /** See addressKey: identifies the address. */
  address_key: string;
  address: string;
  /** Who charged there, in order of name. */
  residents: string[];
  total_energy: number;
  transaction_count: number;
  total_cost: number;
}

/** What is charged at one address in one year. */
export interface YearlySummary {
  year: number;
  address_key: string;
  address: string;
  residents: string[];
  total_energy: number;
  transaction_count: number;
  total_cost: number;
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