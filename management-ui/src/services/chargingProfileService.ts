import { API_BASE_URL } from '../config';

export interface ChargingProfile {
  id: number;
  name: string;
  profile_type: string;
  status: string;
  max_current?: number;
  created_at: string;
  updated_at: string;
}

export interface ChargingProfileCreate {
  name: string;
  profile_type: string;
  max_current?: number;
}

export interface ChargingProfileUpdate {
  name?: string;
  profile_type?: string;
  status?: string;
  max_current?: number;
}

export interface ProfileType {
  value: string;
  label: string;
  description: string;
  fields: string[];
}

export const chargingProfileService = {
  async getProfiles(): Promise<ChargingProfile[]> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch charging profiles');
    }
    return response.json();
  },

  async getProfile(id: number): Promise<ChargingProfile> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/${id}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch charging profile');
    }
    return response.json();
  },

  async createProfile(profile: ChargingProfileCreate): Promise<ChargingProfile> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create charging profile');
    }
    return response.json();
  },

  async updateProfile(id: number, profile: ChargingProfileUpdate): Promise<ChargingProfile> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update charging profile');
    }
    return response.json();
  },

  async inactivateProfile(id: number): Promise<ChargingProfile> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/${id}/inactivate`, {
      method: 'PUT',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to inactivate charging profile');
    }
    const result = await response.json();
    return result.profile;
  },

  async reactivateProfile(id: number): Promise<ChargingProfile> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/${id}/reactivate`, {
      method: 'PUT',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to reactivate charging profile');
    }
    const result = await response.json();
    return result.profile;
  },

  async getAvailableProfileTypes(): Promise<{ profile_types: ProfileType[] }> {
    const response = await fetch(`${API_BASE_URL}/charging-profiles/types/available`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch profile types');
    }
    return response.json();
  },
};
