// Environment-based API configuration
const getApiBaseUrl = () => {
  // In development, use localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }
  
  // In production, use the same domain with API path
  // This assumes your API is served from the same domain
  return window.location.origin + '/api';
};

export const API_BASE_URL = getApiBaseUrl(); 