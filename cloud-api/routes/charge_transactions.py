from fastapi import APIRouter, HTTPException, Security, Cookie
from sqlalchemy.orm import Session, joinedload
from typing import List
from schemas import ChargeTransactionResponse
from models import ChargeTransaction, PowerLog, Card, Resident, ResidentStatus
from dependencies import get_db_dependency
from security import verify_api_key
from invite import verify_auth_token

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

@router.get("/my-transactions", response_model=List[ChargeTransactionResponse])
def get_my_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """
    Get charge transactions for the currently authenticated resident.
    Requires cookie-based authentication.
    """
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    # Verify the resident exists and is active
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    if resident.status != ResidentStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account is not active")
    
    # Get all cards for this resident
    resident_cards = db.query(Card).filter(Card.resident_id == resident_id).all()
    if not resident_cards:
        return []
    
    # Get RFID values for all cards of this resident
    rfid_list = [card.rfid for card in resident_cards]
    
    # Get transactions for all cards of this resident, ordered by ID desc
    transactions = (
        db.query(ChargeTransaction)
        .filter(ChargeTransaction.rfid.in_(rfid_list))
        .options(joinedload(ChargeTransaction.power_logs))
        .order_by(ChargeTransaction.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return transactions 