import { API_BASE_URL } from '../config';

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
}

export const submitEmail = async (email: string): Promise<AuthResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/request-access?email=${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (response.ok) {
      return {
        success: true,
        message: data.message || 'Email submitted successfully. Please check your email for further instructions.',
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to submit email. Please try again.',
      };
    }
  } catch (error) {
    console.error('Error submitting email:', error);
    return {
      success: false,
      message: 'Network error. Please check your connection and try again.',
    };
  }
};

export const validateToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate?auth_token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
}; 