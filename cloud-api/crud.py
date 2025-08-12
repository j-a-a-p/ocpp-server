from sqlalchemy.orm import Session
from models import Resident, ResidentStatus, Card, RefusedCard, ChargingCost
from schemas import ResidentBase, CardBase
from datetime import datetime, date
from typing import List

def get_residents(db: Session, skip: int = 0, limit: int = 100):
    # Only return non-deleted residents
    return db.query(Resident).offset(skip).limit(limit).all()

def get_resident(db: Session, resident_id: int):
    # Only return non-deleted resident
    return db.query(Resident).filter(Resident.id == resident_id).first()

def get_resident_by_email(db: Session, email: str):
    # Get resident by email address
    return db.query(Resident).filter(Resident.email == email).first()

def create_invited_resident(db: Session, resident: ResidentBase, invite_token: str, expires_at: datetime):

    db_resident = Resident(
        full_name=resident.full_name,
        email=resident.email,
        status=ResidentStatus.INVITED,
        invite_token=invite_token,
        invite_expires_at=expires_at
    )
    db.add(db_resident)
    db.commit()
    db.refresh(db_resident)
    return db_resident

def update_resident(db: Session, resident_id: int, updates: dict):
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        return None
        
    for key, value in updates.items():
        setattr(resident, key, value)
    
    db.commit()
    db.refresh(resident)
    return resident

def get_cards(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Card).offset(skip).limit(limit).all()

def create_card(db: Session, card: CardBase):
    db_card = Card(rfid=card.rfid, name=card.name, resident_id=card.resident_id)
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def log_refused_card(db: Session, rfid: str, station_id: str):
    refused_card = RefusedCard(rfid=rfid, station_id=station_id)
    db.add(refused_card)
    db.commit()

def update_card_name(db: Session, rfid: str, name: str):
    card = db.query(Card).filter(Card.rfid == rfid).first()
    if not card:
        return None
    
    card.name = name
    db.commit()
    db.refresh(card)
    return card

def get_charging_costs(db: Session, skip: int = 0, limit: int = 100) -> List[ChargingCost]:
    """Get all charging costs ordered by creation date (newest first)"""
    return db.query(ChargingCost).order_by(ChargingCost.created.desc()).offset(skip).limit(limit).all()

def get_active_charging_cost(db: Session) -> ChargingCost:
    """Get the currently active charging cost"""
    return ChargingCost.get_active_cost(db)

def create_charging_cost(db: Session, kwh_price: float, start_date: date) -> ChargingCost:
    """Create a new charging cost and deactivate the current one"""
    # Check if there's an active cost to deactivate
    active_cost = ChargingCost.get_active_cost(db)
    
    if active_cost:
        # Calculate end_date for current active cost (start_date - 1 day)
        end_date_for_current = start_date - date.resolution
        
        # Deactivate current active cost
        ChargingCost.deactivate_current_cost(db, end_date_for_current)
    
    # Create new charging cost
    new_cost = ChargingCost(
        kwh_price=kwh_price,
        end_date=None  # This will be the new active cost
    )
    db.add(new_cost)
    db.commit()
    db.refresh(new_cost)
    return new_cost

def get_charging_cost_by_id(db: Session, cost_id: int) -> ChargingCost:
    """Get a specific charging cost by ID"""
    return db.query(ChargingCost).filter(ChargingCost.id == cost_id).first()

def get_active_charging_cost_at_date(db: Session, target_date: datetime) -> ChargingCost:
    """Get the active charging cost at a specific date"""
    from models import ChargingCost
    target_date_only = target_date.date()
    
    # Find the charging cost that was active at the target date
    # This means either it has no end_date (still active) or its end_date is after the target date
    return db.query(ChargingCost).filter(
        (ChargingCost.end_date.is_(None)) | (ChargingCost.end_date > target_date_only)
    ).order_by(ChargingCost.created.desc()).first()

def calculate_power_log_costs(db: Session, power_logs: list) -> list:
    """Calculate costs for power logs based on active charging cost at the time"""
    from models import PowerLog
    import logging
    
    logger = logging.getLogger(__name__)
    
    if not power_logs:
        return power_logs
    
    # Get all unique dates from power logs to batch fetch charging costs
    dates = set()
    for log in power_logs:
        dates.add(log.created.date())
    
    # Get charging costs for all relevant dates
    charging_costs = {}
    for date in dates:
        cost = get_active_charging_cost_at_date(db, datetime.combine(date, datetime.min.time()))
        if cost:
            charging_costs[date] = cost.kwh_price
    
    # Calculate costs for each power log
    for log in power_logs:
        log_date = log.created.date()
        kwh_rate = charging_costs.get(log_date, 0.0)
        log.kwh_rate = float(kwh_rate)
        log.delta_power_cost = float(log.energy_kwh * kwh_rate) if log.energy_kwh and kwh_rate else 0.0
    
    return power_logs