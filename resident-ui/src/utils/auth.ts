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

export interface AuthResult {
  isAuthenticated: boolean;
  serverAvailable: boolean;
  error?: string;
}

export const isAuthenticated = async (): Promise<AuthResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'GET',
      credentials: 'include', // This will send the httponly cookie
    });
    
    if (response.ok) {
      return { isAuthenticated: true, serverAvailable: true };
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