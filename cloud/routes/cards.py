from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase
from models import Card, FailedAuthentication
from crud import get_cards, create_card, log_failed_authentication
from dependencies import get_db_dependency
from security import verify_api_key

router = APIRouter(prefix="/cards", tags=["cards"])

@router.get("/", response_model=list[CardResponse])
def read_cards(skip: int = 0, limit: int = 100, db: Session = get_db_dependency()):
    return get_cards(db, skip=skip, limit=limit)

@router.post("/", response_model=CardResponse)
def create_new_card(card: CardBase, db: Session = get_db_dependency()):
    return create_card(db, card)

@router.get("/authenticate/{rfid}")
def authenticate_card(
    rfid: str,
    station_id: str,
    db: Session = get_db_dependency(),
    _: str = Security(verify_api_key),
):
    card = db.query(Card).filter(Card.rfid == rfid).first()
    
    if not card:
        log_failed_authentication(db, rfid, station_id)
        raise HTTPException(status_code=404, detail="Card not found")

    return {"owner_id": card.owner_id}

@router.post("/add_card/{owner_id}", response_model=CardResponse)
def add_card(owner_id: int, db: Session = get_db_dependency()):
    """ Finds the latest FailedAuthentication within 5 minutes and registers a new card for the given owner_id. """

    five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
    latest_failed_auth = (
        db.query(FailedAuthentication)
        .filter(FailedAuthentication.timestamp >= five_minutes_ago)
        .order_by(FailedAuthentication.timestamp.desc())
        .first()
    )
    if not latest_failed_auth:
        raise HTTPException(status_code=404, detail="No recent failed authentication found")

    # Create new card entry
    new_card = Card(rfid=latest_failed_auth.rfid, owner_id=owner_id)
    db.add(new_card)
    db.commit()
    db.refresh(new_card)

    return new_card