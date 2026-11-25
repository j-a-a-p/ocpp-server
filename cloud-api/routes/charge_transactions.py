from collections import defaultdict
from fastapi import APIRouter, HTTPException, Security, Depends
from sqlalchemy.orm import Session, selectinload
from typing import List
from schemas import ChargeTransactionResponse
from models import ChargeTransaction, Card, Household, PowerLog, Resident
from dependencies import get_db_dependency, get_authenticated_active_resident, require_manager
from security import verify_api_key

from crud import ChargingCostLookup, calculate_power_log_costs, total_power_log_cost

router = APIRouter(prefix="/charge-transactions", tags=["charge-transactions"])


def _add_costs(db: Session, transactions: list) -> None:
    prices = ChargingCostLookup(db)
    for transaction in transactions:
        if transaction.power_logs:
            calculate_power_log_costs(db, transaction.power_logs, prices)


@router.get("/", response_model=List[ChargeTransactionResponse])
def get_all_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: str = Security(verify_api_key)
):
    """
    Get all charge transactions with their related power logs.
    Requires API key authentication.
    """
    transactions = (
        db.query(ChargeTransaction)
        .options(selectinload(ChargeTransaction.power_logs))
        .order_by(ChargeTransaction.id)
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
    db: Session = Depends(get_db_dependency),
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
        .options(selectinload(ChargeTransaction.power_logs))
        .order_by(ChargeTransaction.id)
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    _add_costs(db, transactions)
    
    return transactions

@router.get("/my-transactions", response_model=List[ChargeTransactionResponse])
def get_my_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
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
    
    card_names = {card.rfid: card.name for card in resident_cards}
    
    # Get transactions for all cards of this resident, ordered by ID desc
    transactions = (
        db.query(ChargeTransaction)
        .filter(ChargeTransaction.rfid.in_(list(card_names)))
        .options(selectinload(ChargeTransaction.power_logs))
        .order_by(ChargeTransaction.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    _add_costs(db, transactions)
    for transaction in transactions:
        transaction.card_name = card_names.get(transaction.rfid)
    
    return transactions 

@router.get("/all")
def get_all_charge_transactions(
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """
    Get all charge transactions with the resident, the card and the cost of each charge.
    Requires cookie-based authentication for management access.
    """
    rows = (
        db.query(ChargeTransaction, Card.name, Resident)
        .join(Card, ChargeTransaction.rfid == Card.rfid)
        .join(Resident, Card.resident_id == Resident.id)
        .options(selectinload(Resident.household).selectinload(Household.members))
        .order_by(ChargeTransaction.created.desc())
        .all()
    )

    # Only the columns the cost needs, as plain rows: far cheaper than loading every log as an object.
    logs_by_transaction = defaultdict(list)
    for log in db.query(PowerLog.id, PowerLog.charge_transaction_id, PowerLog.created, PowerLog.energy_kwh):
        logs_by_transaction[log.charge_transaction_id].append(log)

    prices = ChargingCostLookup(db)
    result = []
    for transaction, card_name, resident in rows:
        logs = logs_by_transaction.get(transaction.id, [])
        # The moment of the last measurement: when the charge ended.
        ended = max((log.created for log in logs if log.created), default=None)
        household = resident.household
        main = household.main_member if household else None
        result.append({
            "id": transaction.id,
            "station_id": transaction.station_id,
            "rfid": transaction.rfid,
            "created": transaction.created.isoformat() if transaction.created else None,
            "ended": ended.isoformat() if ended else None,
            "final_energy_kwh": float(transaction.final_energy_kwh) if transaction.final_energy_kwh else 0,
            "resident_name": resident.full_name,
            "household_id": resident.household_id,
            "main_resident_name": main.full_name if main else resident.full_name,
            "main_resident_email": main.email if main else resident.email,
            "residency_start_date": household.start_date.isoformat() if household and household.start_date else None,
            "residency_end_date": household.end_date.isoformat() if household and household.end_date else None,
            # The household address: the Charges page groups charges per household.
            "street_name": resident.street_name,
            "house_number": resident.house_number,
            "house_number_suffix": resident.house_number_suffix,
            "zip_code": resident.zip_code,
            "city": resident.city,
            "card_name": card_name,
            "total_cost": total_power_log_cost(logs, prices),
        })
    
    return result 
