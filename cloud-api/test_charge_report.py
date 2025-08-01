#!/usr/bin/env python3
"""
Test script for the charge report endpoint
"""
import requests
import json

# Test the charge report endpoint
def test_charge_report():
    base_url = "http://localhost:8000"
    
    # Test the charge transactions endpoint
    try:
        response = requests.get(f"{base_url}/charge-transactions/all")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Transaction count: {len(data)}")
            if data:
                print(f"Sample transaction: {data[0]}")
        else:
            print("Request failed")
            
    except requests.exceptions.ConnectionError:
        print("Could not connect to server. Make sure the server is running on localhost:8000")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_charge_report() 