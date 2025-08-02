#!/usr/bin/env python3
"""
Test script to verify RFID authorization functionality
"""

from init_db import init_database
from rfid_manager import RFIDManager
from models import Card, Resident, ResidentStatus
from database import SessionLocal

def test_rfid_authorization():
    """Test the RFID authorization functionality."""
    print("Initializing database...")
    init_database()
    
    # Create test data
    db = SessionLocal()
    try:
        # Create a test resident
        test_resident = Resident(
            full_name="Test User",
            email="test@example.com",
            status=ResidentStatus.ACTIVE
        )
        db.add(test_resident)
        db.commit()
        db.refresh(test_resident)
        print(f"Created test resident: {test_resident.full_name} (ID: {test_resident.id})")
        
        # Create a test card for the resident
        test_card = Card(
            rfid="TEST_RFID_123",
            resident_id=test_resident.id
        )
        db.add(test_card)
        db.commit()
        print(f"Created test card: {test_card.rfid}")
        
        # Test authorization
        rfid_manager = RFIDManager()
        
        print("\nTesting authorization...")
        
        # Test with valid RFID
        result1 = rfid_manager.is_authorized("TEST_RFID_123", "TEST_STATION")
        print(f"Authorization for TEST_RFID_123: {'SUCCESS' if result1 else 'FAILED'}")
        
        # Test with invalid RFID
        result2 = rfid_manager.is_authorized("INVALID_RFID", "TEST_STATION")
        print(f"Authorization for INVALID_RFID: {'SUCCESS' if result2 else 'FAILED'}")
        
        # Test with case variations
        result3 = rfid_manager.is_authorized("test_rfid_123", "TEST_STATION")
        print(f"Authorization for test_rfid_123 (lowercase): {'SUCCESS' if result3 else 'FAILED'}")
        
        # Test with whitespace
        result4 = rfid_manager.is_authorized("  TEST_RFID_123  ", "TEST_STATION")
        print(f"Authorization for '  TEST_RFID_123  ' (with whitespace): {'SUCCESS' if result4 else 'FAILED'}")
        
        print("\nRFID authorization test completed!")
        
    except Exception as e:
        print(f"Error during test: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_rfid_authorization() 