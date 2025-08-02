import React, { useEffect, useState } from 'react';
import { Spin, Alert, Button } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import AuthPopup from './AuthPopup';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, serverAvailable, checkAuth } = useAuth();
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [popupManuallyClosed, setPopupManuallyClosed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !popupManuallyClosed && serverAvailable) {
      setShowAuthPopup(true);
    }
    
    // Reset popupManuallyClosed when user becomes authenticated
    if (isAuthenticated) {
      setPopupManuallyClosed(false);
    }
  }, [isLoading, isAuthenticated, popupManuallyClosed, serverAvailable]);

  const handleAuthClose = async () => {
    setShowAuthPopup(false);
    setPopupManuallyClosed(true);
    // Re-check authentication in case user has logged in through email link
    await checkAuth();
  };

  const handleRetryConnection = async () => {
    await checkAuth();
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

  if (!serverAvailable) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <Alert
            message="Server Unavailable"
            description="The server is currently unavailable. Please check your connection and try again."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
          <Button type="primary" onClick={handleRetryConnection}>
            Retry Connection
          </Button>
        </div>
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
        />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute; 