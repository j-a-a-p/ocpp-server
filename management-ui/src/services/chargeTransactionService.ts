import { API_BASE_URL } from '../config';
import type { Address } from '../utils/address';

/** The household and address the resident of the card belongs to: the Charges page groups charges per household. */
export interface ChargeTransaction extends Partial<Address> {
  id: number;
  station_id: string;
  rfid: string;
  created: string;
  /** The moment of the last measurement, empty when the charge has none. */
  ended?: string | null;
  final_energy_kwh: number;
  resident_name: string;
  household_id?: number | null;
  main_resident_name?: string | null;
  main_resident_email?: string | null;
  residency_start_date?: string | null;
  residency_end_date?: string | null;
  card_name?: string | null;
  /** What the energy of the charge costs, at the price of the moment of each power log. */
  total_cost: number;
}

/** What is charged by one household in one month. */
export interface MonthlyData {
  year: number;
  month: number;
  month_display: string;
  /** Identifies the household (or address fallback for accounts without a household). */
  group_key: string;
  household_id: number | null;
  /** See addressKey: identifies the address. */
  address_key: string;
  address: string;
  main_resident: string | null;
  residency_start_date: string | null;
  residency_end_date: string | null;
  /** Who charged there, in order of name. */
  residents: string[];
  total_energy: number;
  transaction_count: number;
  total_cost: number;
}

/** What is charged by one household in one year. */
export interface YearlySummary {
  year: number;
  group_key: string;
  household_id: number | null;
  address_key: string;
  address: string;
  main_resident: string | null;
  residency_start_date: string | null;
  residency_end_date: string | null;
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
