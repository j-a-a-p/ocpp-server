// Authentication utilities
import { API_BASE_URL } from '../config';

export const getAuthToken = (): string | null => {
  const cookies = document.cookie.split(';');
  const authCookie = cookies.find(cookie => 
    cookie.trim().startsWith('auth_token=')
  );
  
  if (authCookie) {
    return authCookie.split('=')[1];
  }
  
  return null;
};

/** The signed in account, as /auth/validate returns it. */
export interface AuthUser {
  resident_id: number;
  email: string;
  full_name: string;
  roles: string[];
  household_id?: number | null;
  is_main_member?: boolean;
  /** Set for a household member: the resident who invited them. */
  household_head_id: number | null;
  residency_start_date?: string | null;
  residency_end_date?: string | null;
  residency_state?: 'upcoming' | 'active' | 'ended' | null;
  street_name: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  zip_code: string | null;
  city: string | null;
}

export interface AuthResult {
  isAuthenticated: boolean;
  serverAvailable: boolean;
  user?: AuthUser;
  error?: string;
}

const readUser = async (response: Response): Promise<AuthUser | undefined> => {
  try {
    const data = await response.json();
    if (Array.isArray(data?.roles)) {
      return {
        ...data,
        household_id: data.household_id ?? null,
        is_main_member: data.is_main_member ?? data.household_head_id == null,
        household_head_id: data.household_head_id ?? null,
        residency_start_date: data.residency_start_date ?? null,
        residency_end_date: data.residency_end_date ?? null,
        residency_state: data.residency_state ?? null,
        street_name: data.street_name ?? null,
        house_number: data.house_number ?? null,
        house_number_suffix: data.house_number_suffix ?? null,
        zip_code: data.zip_code ?? null,
        city: data.city ?? null,
      };
    }
  } catch {
    // No readable account: the caller is signed in, just without details.
  }
  return undefined;
};

export const isAuthenticated = async (): Promise<AuthResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'GET',
      credentials: 'include', // This will send the httponly cookie
    });
    
    if (response.ok) {
      const user = await readUser(response);
      return user ? { isAuthenticated: true, serverAvailable: true, user } : { isAuthenticated: true, serverAvailable: true };
    } else if (response.status === 401) {
      return { isAuthenticated: false, serverAvailable: true };
    } else if (response.status >= 500) {
      // Server errors (503, 500, etc.) indicate server is unavailable
      return { isAuthenticated: false, serverAvailable: false, error: `Server error: ${response.status}` };
    } else {
      return { isAuthenticated: false, serverAvailable: true, error: `Server error: ${response.status}` };
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    // Network errors indicate server is unavailable
    return { isAuthenticated: false, serverAvailable: false, error: 'Server unavailable' };
  }
};

export const checkServerConnectivity = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'GET',
      credentials: 'include',
    });
    // If we get any response except 5xx errors, server is available
    return response.status < 500;
  } catch (error) {
    console.error('Server connectivity check failed:', error);
    return false;
  }
};

export const setAuthToken = (token: string): void => {
  // Set cookie with appropriate attributes
  document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Strict`;
};

export const removeAuthToken = (): void => {
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
};

/** Ends the session. The auth cookie is httponly, so only the server can remove it. */
export const logout = async (): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Logout failed: ${response.status}`);
  }
};