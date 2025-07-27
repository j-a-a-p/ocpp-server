#!/usr/bin/env python3
"""
Test script to verify database functionality
"""

from init_db import init_database
from transaction_service import TransactionService

def test_database():
    """Test the database functionality."""
    print("Initializing database...")
    init_database()
    
    print("Creating test transaction...")
    transaction = TransactionService.create_transaction(
        station_name="TEST_STATION_001",
        rfid="TEST_RFID_123"
    )
    print(f"Created transaction with ID: {transaction.id}")
    
    print("Retrieving transaction by ID...")
    retrieved = TransactionService.get_transaction_by_id(transaction.id)
    if retrieved:
        print(f"Retrieved transaction: ID={retrieved.id}, Station={retrieved.station_name}, RFID={retrieved.rfid}, Created={retrieved.created}")
    
    print("Retrieving transactions by station...")
    station_transactions = TransactionService.get_transactions_by_station("TEST_STATION_001")
    print(f"Found {len(station_transactions)} transactions for TEST_STATION_001")
    
    print("Retrieving transactions by RFID...")
    rfid_transactions = TransactionService.get_transactions_by_rfid("TEST_RFID_123")
    print(f"Found {len(rfid_transactions)} transactions for TEST_RFID_123")
    
    print("Database test completed successfully!")

if __name__ == "__main__":
    test_database() 