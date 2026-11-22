import React, { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from './AuthLayout';
import AuthPopup from './AuthPopup';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, serverAvailable, checkAuth } = useAuth();
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [popupManuallyClosed, setPopupManuallyClosed] = useState(false);
  const [mailSentTo, setMailSentTo] = useState<string | null>(null);
  const [closeRefused, setCloseRefused] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !popupManuallyClosed && serverAvailable) {
      setShowAuthPopup(true);
    }
    
    if (isAuthenticated) {
      setPopupManuallyClosed(false);
      setMailSentTo(null);
    }
  }, [isLoading, isAuthenticated, popupManuallyClosed, serverAvailable]);

  const handleAuthClose = async () => {
    setShowAuthPopup(false);
    setPopupManuallyClosed(true);
    // Re-check authentication in case user has logged in through email link
    await checkAuth();
  };

  const handleMailSent = (email: string) => {
    setShowAuthPopup(false);
    setPopupManuallyClosed(true);
    setMailSentTo(email);
  };

  const handleUseOtherEmail = () => {
    setMailSentTo(null);
    setCloseRefused(false);
    setPopupManuallyClosed(false);
    setShowAuthPopup(true);
  };

  // The link in the mail opens in a new tab and signs in there; this tab has nothing left to do.
  const handleClosePage = () => {
    window.close();
    // A browser only lets a script close a page that a script opened.
    setTimeout(() => setCloseRefused(true), 200);
  };

  if (isLoading) {
    return (
      <div className="auth-page">
        <Spin size="large" />
      </div>
    );
  }

  if (!serverAvailable) {
    return (
      <AuthLayout>
        <Result
          status="warning"
          title="Server unavailable"
          subTitle="The server is currently unavailable. Please check your connection and try again."
          extra={
            <Button type="primary" onClick={checkAuth}>
              Retry connection
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  if (!isAuthenticated && mailSentTo) {
    return (
      <AuthLayout>
        <Result
          status="success"
          title="Login mail is sent"
          subTitle={
            closeRefused
              ? `Open the link in the mail we sent to ${mailSentTo}. Your browser does not let this page close itself: close this tab yourself.`
              : `Open the link in the mail we sent to ${mailSentTo} to sign in. Then you can close this page.`
          }
          extra={[
            <Button type="primary" key="close" onClick={handleClosePage}>
              Click here to close this page
            </Button>,
            <Button type="link" key="other" onClick={handleUseOtherEmail}>
              Use a different email address
            </Button>,
          ]}
        />
      </AuthLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthLayout>
          <Result
            icon={<MailOutlined />}
            title="Welcome"
            subTitle="Sign in with the link we email you to see your charging sessions."
            extra={
              <Button type="primary" onClick={() => setShowAuthPopup(true)}>
                Sign in
              </Button>
            }
          />
        </AuthLayout>
        <AuthPopup
          open={showAuthPopup}
          onClose={handleAuthClose}
          onSent={handleMailSent}
        />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
