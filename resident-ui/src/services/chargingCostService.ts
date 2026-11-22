import { API_BASE_URL } from '../config';

export type Tariff = 'normaal' | 'dal';

export interface ChargingCost {
  id: number;
  kwh_price: number; // tariff Normaal
  kwh_price_dal: number | null; // tariff Dal: weekend and 21:00-07:00
  end_date: string | null;
  created: string;
  current_tariff: Tariff; // the tariff that applies right now
  current_kwh_price: number; // the price that applies right now
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
