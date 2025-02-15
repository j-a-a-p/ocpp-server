from sqlalchemy.orm import Session
from models import Owner, OwnerReference, Card, FailedAuthentication
from schemas import OwnerBase, CardBase

def get_owners(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Owner).offset(skip).limit(limit).all()

def get_owner(db: Session, owner_id: int):
    return db.query(Owner).filter(Owner.id == owner_id).first()

def create_owner(db: Session, owner: OwnerBase):
    reference = db.query(OwnerReference).filter(OwnerReference.reference == owner.reference).first()
    if not reference:
        return None
    db_owner = Owner(full_name=owner.full_name, email=owner.email, reference_id=reference.id)
    db.add(db_owner)
    db.commit()
    db.refresh(db_owner)
    return db_owner

def get_cards(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Card).offset(skip).limit(limit).all()

def create_card(db: Session, card: CardBase):
    db_card = Card(rfid=card.rfid, owner_id=card.owner_id, status=card.status)
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def log_failed_authentication(db: Session, rfid: str, station_id: str):
    failed_attempt = FailedAuthentication(rfid=rfid, station_id=station_id)
    db.add(failed_attempt)
    db.commit()