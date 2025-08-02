import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isAuthenticated, AuthResult } from '../utils/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  serverAvailable: boolean;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(true);

  const checkAuth = async () => {
    setLoading(true);
    
    try {
      const authResult: AuthResult = await isAuthenticated();
      setAuthenticated(authResult.isAuthenticated);
      setServerAvailable(authResult.serverAvailable);
    } catch (error) {
      console.error('Error checking authentication:', error);
      setAuthenticated(false);
      setServerAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Periodic retry when server is unavailable
  useEffect(() => {
    if (!serverAvailable) {
      const interval = setInterval(() => {
        console.log('Retrying server connection...');
        checkAuth();
      }, 10000); // Retry every 10 seconds

      return () => clearInterval(interval);
    }
  }, [serverAvailable]);

  const value: AuthContextType = {
    isAuthenticated: authenticated,
    isLoading: loading,
    serverAvailable,
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