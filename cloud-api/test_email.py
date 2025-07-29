#!/usr/bin/env python3
"""
Test script to verify email sending functionality.
Run this script to test if AWS SES is properly configured and working.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from invite import send_invitation_email
from constants import SES_ACCESS_KEY, SES_SECRET_KEY, INVITE_URL

def test_email_configuration():
    """Test the email configuration and sending."""
    print("Testing email configuration...")
    
    # Check if AWS credentials are configured
    if not SES_ACCESS_KEY or not SES_SECRET_KEY:
        print("❌ AWS SES credentials not configured!")
        print("Please check your configuration file at:")
        print("  - macOS: ~/.config/occp-server/configuration.ini")
        print("  - Linux: /etc/occp-server/configuration.ini")
        print("\nMake sure it contains:")
        print("[SimpleEmailService]")
        print("SES_ACCESS_KEY=your_access_key")
        print("SES_SECRET_KEY=your_secret_key")
        return False
    
    print("✅ AWS SES credentials found")
    
    # Check if INVITE_URL is configured
    if not INVITE_URL:
        print("❌ INVITE_URL not configured!")
        print("Please add INVITE_URL to your configuration file:")
        print("[ResidentUI]")
        print("INVITE_URL=http://localhost:5174")
        return False
    
    print("✅ INVITE_URL configured:", INVITE_URL)
    
    return True

def test_email_sending():
    """Test sending an invitation email."""
    print("\nTesting email sending...")
    
    try:
        # Test with a dummy email (replace with your email for testing)
        test_email = "test@example.com"
        test_token = "test_token_12345"
        
        print(f"Sending test email to {test_email}...")
        send_invitation_email(test_email, test_token)
        print("✅ Email sent successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        print("\nCommon issues:")
        print("1. AWS SES credentials are invalid")
        print("2. AWS SES is not configured in your region")
        print("3. The sender email is not verified in AWS SES")
        print("4. Network connectivity issues")
        return False

def main():
    """Main test function."""
    print("=== Email Configuration Test ===\n")
    
    # Test configuration
    config_ok = test_email_configuration()
    
    if not config_ok:
        print("\n❌ Configuration test failed. Please fix the issues above.")
        return
    
    # Test email sending
    email_ok = test_email_sending()
    
    if email_ok:
        print("\n✅ All tests passed! Email functionality should work.")
    else:
        print("\n❌ Email sending test failed. Please check the error messages above.")

if __name__ == "__main__":
    main() 