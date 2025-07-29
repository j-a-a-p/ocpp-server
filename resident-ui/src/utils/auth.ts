// Authentication utilities
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

export const isAuthenticated = (): boolean => {
  return getAuthToken() !== null;
};

export const setAuthToken = (token: string): void => {
  // Set cookie with appropriate attributes
  document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Strict`;
};

export const removeAuthToken = (): void => {
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}; 