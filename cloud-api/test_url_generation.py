#!/usr/bin/env python3

# Test script to verify URL generation logic
import sys
import os

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from constants import INVITE_URL
from invite import send_login_email

def test_url_generation():
    """Test the URL generation logic for both flows."""
    
    print("Testing URL generation logic...")
    print(f"INVITE_URL from config: {INVITE_URL}")
    
    # Test base URL extraction
    base_url = INVITE_URL.rstrip('/')
    if base_url.endswith('/resident-ui'):
        base_url = base_url[:-len('/resident-ui')]
    
    print(f"Extracted base URL: {base_url}")
    
    # Test resident flow URL
    resident_url = f"{base_url}/resident-ui/login?token=test_token"
    print(f"Resident flow URL: {resident_url}")
    
    # Test management flow URL
    management_url = f"{base_url}/management-ui/login?token=test_token"
    print(f"Management flow URL: {management_url}")
    
    # Verify the URLs are correct
    if "/resident-ui/resident-ui" in resident_url:
        print("❌ ERROR: Resident URL has duplicate /resident-ui")
    else:
        print("✅ Resident URL is correct")
    
    if "/resident-ui/management-ui" in management_url:
        print("❌ ERROR: Management URL has /resident-ui prefix")
    else:
        print("✅ Management URL is correct")
    
    if "/management-ui/login" in management_url:
        print("✅ Management URL contains correct path")
    else:
        print("❌ ERROR: Management URL missing correct path")

if __name__ == "__main__":
    test_url_generation() 