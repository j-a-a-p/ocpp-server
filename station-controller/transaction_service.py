from sqlalchemy.orm import Session
from models import ChargeTransaction
from database import SessionLocal

class TransactionService:
    @staticmethod
    def create_transaction(station_name: str, rfid: str) -> ChargeTransaction:
        """Create a new charge transaction in the database."""
        db = SessionLocal()
        try:
            transaction = ChargeTransaction(
                station_name=station_name,
                rfid=rfid
            )
            db.add(transaction)
            db.commit()
            db.refresh(transaction)
            return transaction
        finally:
            db.close()
    
    @staticmethod
    def get_transaction_by_id(transaction_id: int) -> ChargeTransaction:
        """Get a transaction by its ID."""
        db = SessionLocal()
        try:
            return db.query(ChargeTransaction).filter(ChargeTransaction.id == transaction_id).first()
        finally:
            db.close()
    
    @staticmethod
    def get_transactions_by_station(station_name: str) -> list[ChargeTransaction]:
        """Get all transactions for a specific station."""
        db = SessionLocal()
        try:
            return db.query(ChargeTransaction).filter(ChargeTransaction.station_name == station_name).all()
        finally:
            db.close()
    
    @staticmethod
    def get_transactions_by_rfid(rfid: str) -> list[ChargeTransaction]:
        """Get all transactions for a specific RFID."""
        db = SessionLocal()
        try:
            return db.query(ChargeTransaction).filter(ChargeTransaction.rfid == rfid).all()
        finally:
            db.close() 