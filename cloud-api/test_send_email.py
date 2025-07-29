#!/usr/bin/env python3
"""
Test script to send an invitation email to jaapstelwagen@gmail.com
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from invite import send_invitation_email
from constants import SES_ACCESS_KEY, SES_SECRET_KEY, INVITE_URL

def main():
    """Send a test invitation email to jaapstelwagen@gmail.com"""
    print("=== Sending Test Invitation Email ===\n")
    
    # Check if AWS credentials are configured
    if not SES_ACCESS_KEY or not SES_SECRET_KEY:
        print("❌ AWS SES credentials not configured!")
        print("Please add your AWS credentials to /etc/ocpp-server/configuration.ini:")
        print("\n[SimpleEmailService]")
        print("SES_ACCESS_KEY=your_access_key")
        print("SES_SECRET_KEY=your_secret_key")
        return
    
    # Check if INVITE_URL is configured
    if not INVITE_URL:
        print("❌ INVITE_URL not configured!")
        print("Please add INVITE_URL to your configuration file:")
        print("\n[ResidentUI]")
        print("INVITE_URL=http://localhost:5174")
        return
    
    print("✅ Configuration looks good")
    print(f"📧 Sending test invitation email to: jaapstelwagen@gmail.com")
    print(f"🔗 Invite URL: {INVITE_URL}")
    
    try:
        # Generate a test token
        test_token = "test_invitation_token_12345"
        
        # Send the invitation email
        send_invitation_email("jaapstelwagen@gmail.com", test_token)
        
        print("✅ Test email sent successfully!")
        print(f"\n📧 Check your email at: jaapstelwagen@gmail.com")
        print(f"🔗 Test activation link: {INVITE_URL}/activate?token={test_token}")
        
    except Exception as e:
        print(f"❌ Failed to send test email: {str(e)}")
        print("\nCommon issues:")
        print("1. AWS SES credentials are invalid")
        print("2. AWS SES is not configured in eu-central-1 region")
        print("3. The sender email (charger@aircokopen.nu) is not verified in AWS SES")
        print("4. You're in SES sandbox mode and jaapstelwagen@gmail.com is not verified")
        print("5. Network connectivity issues")

if __name__ == "__main__":
    main() 