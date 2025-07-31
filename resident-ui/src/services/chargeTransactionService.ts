import { API_BASE_URL } from '../config';

export interface PowerLog {
  id: number;
  charge_transaction_id: number;
  power_kw: number;
  energy_kwh: number;
  created: string;
}

export interface ChargeTransaction {
  id: number;
  station_id: string;
  rfid: string;
  created: string;
  final_energy_kwh: number | null;
  power_logs: PowerLog[];
}

export interface ChargeTransactionsResponse {
  transactions: ChargeTransaction[];
  total: number;
  skip: number;
  limit: number;
}

export const getCurrentResidentTransactions = async (
  skip: number = 0,
  limit: number = 10
): Promise<ChargeTransactionsResponse> => {
  try {
    // Get the transactions for the currently authenticated resident
    const transactionsResponse = await fetch(
      `${API_BASE_URL}/charge-transactions/my-transactions?skip=${skip}&limit=${limit}`,
      {
        credentials: 'include',
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const transactions = await transactionsResponse.json();

    return {
      transactions,
      total: transactions.length, // Note: API doesn't return total count, so we use length
      skip,
      limit,
    };
  } catch (error) {
    console.error('Error fetching charge transactions:', error);
    throw error;
  }
}; 