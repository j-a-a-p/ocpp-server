import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isAuthenticated, getAuthToken } from '../utils/auth';
import { validateToken } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    setLoading(true);
    
    try {
      const hasToken = isAuthenticated();
      
      if (hasToken) {
        const token = getAuthToken();
        if (token) {
          const isValid = await validateToken(token);
          setAuthenticated(isValid);
          
          if (!isValid) {
            // Token is invalid, remove it
            document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          }
        } else {
          setAuthenticated(false);
        }
      } else {
        setAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    isAuthenticated: authenticated,
    isLoading: loading,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 