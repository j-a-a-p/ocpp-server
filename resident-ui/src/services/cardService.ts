import { API_BASE_URL } from '../config';

export interface Card {
  rfid: string;
  name: string;
  resident_id: number;
}

export interface CardUpdate {
  name: string;
}

export const getMyCards = async (): Promise<Card[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/cards/my_cards`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch cards');
    }

    const data = await response.json();
    return data.cards;
  } catch (error) {
    console.error('Error fetching cards:', error);
    throw error;
  }
};

export const addCard = async (stationId: string): Promise<Card> => {
  try {
    const response = await fetch(`${API_BASE_URL}/cards/add_card/${stationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to add card');
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding card:', error);
    throw error;
  }
};

export const updateCardName = async (rfid: string, name: string): Promise<Card> => {
  try {
    const response = await fetch(`${API_BASE_URL}/cards/${rfid}/name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error('Failed to update card name');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating card name:', error);
    throw error;
  }
};
