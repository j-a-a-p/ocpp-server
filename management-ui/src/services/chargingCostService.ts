import { API_BASE_URL } from '../config';

export interface ChargingCost {
  id: number;
  kwh_price: number;
  end_date: string | null;
  created: string;
}

export interface ChargingCostCreate {
  kwh_price: number;
  start_date: string;
}

export const chargingCostService = {
  async getAllChargingCosts(): Promise<ChargingCost[]> {
    const response = await fetch(`${API_BASE_URL}/charging-costs/`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch charging costs');
    }
    
    return response.json();
  },

  async getActiveChargingCost(): Promise<ChargingCost> {
    const response = await fetch(`${API_BASE_URL}/charging-costs/active`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch active charging cost');
    }
    
    return response.json();
  },

  async createChargingCost(cost: ChargingCostCreate): Promise<ChargingCost> {
    console.log('Service sending data:', cost);
    console.log('JSON stringified:', JSON.stringify(cost));
    
    const response = await fetch(`${API_BASE_URL}/charging-costs/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(cost),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to create charging cost');
    }
    
    return response.json();
  },
};
