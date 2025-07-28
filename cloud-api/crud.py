from sqlalchemy.orm import Session
from models import Owner, OwnerStatus, Card, FailedAuthentication
from schemas import OwnerBase, CardBase
from datetime import datetime

def get_owners(db: Session, skip: int = 0, limit: int = 100):
    # Only return non-deleted owners
    return db.query(Owner).filter(Owner.deleted_at.is_(None)).offset(skip).limit(limit).all()

def get_owner(db: Session, owner_id: int):
    # Only return non-deleted owner
    return db.query(Owner).filter(Owner.id == owner_id, Owner.deleted_at.is_(None)).first()

def create_invited_owner(db: Session, owner: OwnerBase, invite_token: str, expires_at: datetime):

    db_owner = Owner(
        full_name=owner.full_name,
        email=owner.email,
        reference=owner.reference,
        status=OwnerStatus.INVITED,
        invite_token=invite_token,
        invite_expires_at=expires_at
    )
    db.add(db_owner)
    db.commit()
    db.refresh(db_owner)
    return db_owner

def update_owner(db: Session, owner_id: int, updates: dict):
    owner = db.query(Owner).filter(Owner.id == owner_id, Owner.deleted_at.is_(None)).first()
    if not owner:
        return None
        
    for key, value in updates.items():
        setattr(owner, key, value)
    
    db.commit()
    db.refresh(owner)
    return owner

def delete_owner(db: Session, owner_id: int) -> bool:
    # First check if owner has any cards
    cards = db.query(Card).filter(Card.owner_id == owner_id).first()
    if cards:
        # Cannot delete owner with cards - use soft delete instead
        return False
        
    owner = db.query(Owner).filter(Owner.id == owner_id, Owner.deleted_at.is_(None)).first()
    if not owner:
        return False
        
    # Soft delete - mark as deleted instead of removing
    owner.deleted_at = datetime.utcnow()
    db.commit()
    return True

def soft_delete_owner(db: Session, owner_id: int) -> bool:
    """Soft delete an owner (mark as deleted but keep the record)"""
    owner = db.query(Owner).filter(Owner.id == owner_id, Owner.deleted_at.is_(None)).first()
    if not owner:
        return False
        
    # Mark as deleted
    owner.deleted_at = datetime.utcnow()
    db.commit()
    return True

def get_cards(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Card).offset(skip).limit(limit).all()

def create_card(db: Session, card: CardBase):
    db_card = Card(rfid=card.rfid, owner_id=card.owner_id)
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def log_failed_authentication(db: Session, rfid: str, station_id: str):
    failed_attempt = FailedAuthentication(rfid=rfid, station_id=station_id)
    db.add(failed_attempt)
    db.commit()