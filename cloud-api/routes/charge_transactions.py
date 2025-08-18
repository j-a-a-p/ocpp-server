from fastapi import APIRouter, HTTPException, Security, Cookie, Depends
from sqlalchemy.orm import Session, joinedload
from typing import List
from schemas import ChargeTransactionResponse
from models import ChargeTransaction, Card, Resident, ResidentStatus
from dependencies import get_db_dependency, get_authenticated_active_resident
from security import verify_api_key
from invite import verify_auth_token
from crud import calculate_power_log_costs

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
    
    # Calculate costs for power logs
    for transaction in transactions:
        if transaction.power_logs:
            calculate_power_log_costs(db, transaction.power_logs)
    
    return transactions

@router.get("/my-transactions", response_model=List[ChargeTransactionResponse])
def get_my_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """
    Get charge transactions for the currently authenticated resident.
    Requires cookie-based authentication.
    """
    # Get all cards for this resident
    resident_cards = db.query(Card).filter(Card.resident_id == _.id).all()
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
    
    # Calculate costs for power logs and add card names
    for transaction in transactions:
        if transaction.power_logs:
            calculate_power_log_costs(db, transaction.power_logs)
        
        card = db.query(Card).filter(Card.rfid == transaction.rfid).first()
        if card:
            transaction.card_name = card.name
    
    return transactions 

@router.get("/all")
def get_all_charge_transactions(
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """
    Get all charge transactions with resident information and power logs for cost calculation.
    Requires cookie-based authentication for management access.
    """
    # Get all charge transactions with power logs and resident information
    transactions = (
        db.query(ChargeTransaction)
        .options(joinedload(ChargeTransaction.power_logs))
        .join(Card, ChargeTransaction.rfid == Card.rfid)
        .join(Resident, Card.resident_id == Resident.id)
        .order_by(ChargeTransaction.created.desc())
        .all()
    )
    
    # Calculate costs for power logs and convert to dictionary format
    result = []
    for transaction in transactions:
        # Calculate costs for power logs
        if transaction.power_logs:
            calculate_power_log_costs(db, transaction.power_logs)
        
        # Get resident name
        resident_name = None
        card = db.query(Card).filter(Card.rfid == transaction.rfid).first()
        if card:
            resident = db.query(Resident).filter(Resident.id == card.resident_id).first()
            if resident:
                resident_name = resident.full_name
        
        result.append({
            "id": transaction.id,
            "station_id": transaction.station_id,
            "rfid": transaction.rfid,
            "created": transaction.created.isoformat() if transaction.created else None,
            "final_energy_kwh": float(transaction.final_energy_kwh) if transaction.final_energy_kwh else 0,
            "resident_name": resident_name,
            "power_logs": [
                {
                    "id": log.id,
                    "energy_kwh": float(log.energy_kwh) if log.energy_kwh is not None else 0,
                    "delta_power_cost": float(log.delta_power_cost) if hasattr(log, 'delta_power_cost') and log.delta_power_cost is not None else 0,
                    "kwh_rate": float(log.kwh_rate) if hasattr(log, 'kwh_rate') and log.kwh_rate is not None else 0
                }
                for log in (transaction.power_logs or [])
            ]
        })
    
    return result 