import { API_BASE_URL } from '../config';

export interface PowerLog {
  id: number;
  charge_transaction_id: number;
  created: string;
  power_kw: number;
  energy_kwh: number;
}

export const getPowerLogs = async (skip: number = 0, limit: number = 1000): Promise<PowerLog[]> => {
  const response = await fetch(`${API_BASE_URL}/power-logs/?skip=${skip}&limit=${limit}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch PowerLog data');
  }

  return response.json();
};
