import { API_BASE_URL } from '../config';

export interface PowerLog {
  id: number;
  charge_transaction_id: number;
  power_kw: number;
  energy_kwh: number;
  created: string;
  delta_power_cost?: number;
  kwh_rate?: number;
}

export interface ChargeTransaction {
  id: number;
  station_id: string;
  rfid: string;
  card_name?: string;
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

export interface MonthlyEnergyStats {
  month: string;
  year: number;
  totalEnergy: number;
  transactionCount: number;
  totalCost: number;
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

export const getAllCurrentResidentTransactions = async (): Promise<ChargeTransaction[]> => {
  try {
    // Get all transactions for the currently authenticated resident (no pagination)
    const transactionsResponse = await fetch(
      `${API_BASE_URL}/charge-transactions/my-transactions?skip=0&limit=1000`,
      {
        credentials: 'include',
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const transactions = await transactionsResponse.json();
    return transactions;
  } catch (error) {
    console.error('Error fetching all charge transactions:', error);
    throw error;
  }
};

export const calculateMonthlyEnergyStats = (transactions: ChargeTransaction[]): MonthlyEnergyStats[] => {
  const monthlyStats = new Map<string, MonthlyEnergyStats>();

  transactions.forEach(transaction => {
    if (transaction.final_energy_kwh) {
      const date = new Date(transaction.created);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyStats.has(monthKey)) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        monthlyStats.set(monthKey, {
          month: monthNames[date.getMonth()],
          year: date.getFullYear(),
          totalEnergy: 0,
          transactionCount: 0,
          totalCost: 0
        });
      }
      
      const stats = monthlyStats.get(monthKey)!;
      stats.totalEnergy += transaction.final_energy_kwh;
      stats.transactionCount += 1;
      
      // Calculate total cost for this transaction
      if (transaction.power_logs) {
        const transactionCost = transaction.power_logs.reduce((sum, log) => {
          return sum + (log.delta_power_cost || 0);
        }, 0);
        stats.totalCost += transactionCost;
      }
    }
  });

  // Convert to array and sort by date (newest first)
  return Array.from(monthlyStats.values())
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
      return monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month);
    });
}; 