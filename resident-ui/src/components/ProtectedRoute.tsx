import React, { useState, useEffect } from 'react';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import AuthPopup from './AuthPopup';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();
  const [showAuthPopup, setShowAuthPopup] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowAuthPopup(true);
    }
  }, [isLoading, isAuthenticated]);

  const handleAuthSuccess = async () => {
    setShowAuthPopup(false);
    await checkAuth();
  };

  const handleAuthClose = () => {
    setShowAuthPopup(false);
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          background: '#f5f5f5'
        }}>
          <div style={{ textAlign: 'center' }}>
            <h2>Welcome to Resident Portal</h2>
            <p>Please authenticate to continue...</p>
          </div>
        </div>
        <AuthPopup
          visible={showAuthPopup}
          onClose={handleAuthClose}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute; 