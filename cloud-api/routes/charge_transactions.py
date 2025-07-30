from fastapi import APIRouter, HTTPException, Security
from sqlalchemy.orm import Session, joinedload
from typing import List
from schemas import ChargeTransactionResponse
from models import ChargeTransaction, PowerLog, Card, Resident
from dependencies import get_db_dependency
from security import verify_api_key

router = APIRouter(prefix="/charge-transactions", tags=["charge-transactions"])

@router.get("/", response_model=List[ChargeTransactionResponse])
def get_all_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    _: str = Security(verify_api_key)
):
    """
    Get all charge transactions with their related power logs.
    Requires API key authentication.
    """
    transactions = (
        db.query(ChargeTransaction)
        .options(joinedload(ChargeTransaction.power_logs))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return transactions

@router.get("/resident/{resident_id}", response_model=List[ChargeTransactionResponse])
def get_transactions_by_resident(
    resident_id: int,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    _: str = Security(verify_api_key)
):
    """
    Get all charge transactions for a specific resident (by resident_id).
    Requires API key authentication.
    """
    # First verify the resident exists
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    # Get all cards for this resident
    resident_cards = db.query(Card).filter(Card.resident_id == resident_id).all()
    if not resident_cards:
        return []
    
    # Get RFID values for all cards of this resident
    rfid_list = [card.rfid for card in resident_cards]
    
    # Get transactions for all cards of this resident
    transactions = (
        db.query(ChargeTransaction)
        .filter(ChargeTransaction.rfid.in_(rfid_list))
        .options(joinedload(ChargeTransaction.power_logs))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return transactions 