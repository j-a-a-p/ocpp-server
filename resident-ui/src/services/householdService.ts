import { API_BASE_URL } from '../config';

export interface HouseholdMember {
  id: number;
  full_name: string;
  email: string;
  status: string;
  street_name: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  zip_code: string | null;
  city: string | null;
}

export const getHouseholdMembers = async (): Promise<HouseholdMember[]> => {
  const response = await fetch(`${API_BASE_URL}/residents/household-members`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch household members');
  }

  return await response.json();
};

/** Invites a household member. They live at the address of the resident who invites them. */
export const inviteHouseholdMember = async (member: { full_name: string; email: string }): Promise<HouseholdMember> => {
  const response = await fetch(`${API_BASE_URL}/residents/household-members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(member),
  });

  if (!response.ok) {
    let reason = 'Failed to invite household member';
    try {
      const error = await response.json();
      if (typeof error.detail === 'string') reason = error.detail;
    } catch {
      // keep the general reason
    }
    throw new Error(reason);
  }

  return await response.json();
};
