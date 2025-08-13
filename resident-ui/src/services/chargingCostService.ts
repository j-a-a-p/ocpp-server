import { API_BASE_URL } from '../config';

export interface ChargingCost {
  id: number;
  kwh_price: number;
  end_date: string | null;
  created: string;
}

export const chargingCostService = {
  async getActiveChargingCost(): Promise<ChargingCost> {
    const response = await fetch(`${API_BASE_URL}/charging-costs/active`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch active charging cost');
    }
    
    return response.json();
  },
};
