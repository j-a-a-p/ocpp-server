from sqlalchemy.orm import Session
from models import Resident, ResidentStatus, Card, RefusedCard
from schemas import ResidentBase, CardBase
from datetime import datetime

def get_residents(db: Session, skip: int = 0, limit: int = 100):
    # Only return non-deleted residents
    return db.query(Resident).offset(skip).limit(limit).all()

def get_resident(db: Session, resident_id: int):
    # Only return non-deleted resident
    return db.query(Resident).filter(Resident.id == resident_id).first()

def create_invited_resident(db: Session, resident: ResidentBase, invite_token: str, expires_at: datetime):

    db_resident = Resident(
        full_name=resident.full_name,
        email=resident.email,
        reference=resident.reference,
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
    db_card = Card(rfid=card.rfid, resident_id=card.resident_id)
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def log_refused_card(db: Session, rfid: str, station_id: str):
    refused_card = RefusedCard(rfid=rfid, station_id=station_id)
    db.add(refused_card)
    db.commit()