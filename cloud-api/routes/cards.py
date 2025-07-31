from datetime import datetime, timedelta
from fastapi import APIRouter, Cookie, HTTPException, Security
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase
from models import Card, RefusedCard
from crud import get_cards, create_card, log_refused_card
from dependencies import get_db_dependency
from security import verify_api_key
from invite import verify_auth_token

router = APIRouter(prefix="/cards", tags=["cards"])

@router.get("/", response_model=list[CardResponse])
def read_cards(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """Get all cards. Requires cookie-based authentication for management access."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    return get_cards(db, skip=skip, limit=limit)

@router.post("/", response_model=CardResponse)
def create_new_card(
    card: CardBase, 
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """Create a new card. Requires cookie-based authentication for management access."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    return create_card(db, card)

@router.get("/authenticate/{rfid}")
def authenticate_card(
    rfid: str,
    station_id: str,
    db: Session = get_db_dependency(),
    _: str = Security(verify_api_key),
):
    """Authenticate a card for station access. Requires API key authentication."""
    card = db.query(Card).filter(Card.rfid == rfid).first()
    
    if not card:
        log_refused_card(db, rfid, station_id)
        raise HTTPException(status_code=404, detail="Card not found")

    return {"resident_id": card.resident_id}

@router.post("/add_card/{station_id}", response_model=CardResponse)
def add_card(station_id: str, db: Session = get_db_dependency(), auth_token: str = Cookie(None)):
    """ Finds the latest RefusedCard within 5 minutes and registers a new card for the given resident_id. """

    if not auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Unauthorized: wrong credentials")


    latest_refused_card_by_station = (
        db.query(RefusedCard)
        .filter(RefusedCard.station_id == station_id)
        .order_by(RefusedCard.created.desc())
        .first()
    )
    if not latest_refused_card_by_station:
        raise HTTPException(status_code=404, detail="No recent refused card found")

    new_card = Card(rfid=latest_refused_card_by_station.rfid, resident_id=resident_id)
    db.add(new_card)
    
    # Delete the refused card after successfully adding it to the cards table
    db.delete(latest_refused_card_by_station)
    
    db.commit()
    db.refresh(new_card)

    return new_card

@router.get("/my_cards")
def get_my_cards(db: Session = get_db_dependency(), auth_token: str = Cookie(None)):
    """ Returns all cards for the authenticated resident. """
    if not auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Unauthorized: wrong credentials")
    
    cards = (
        db.query(Card)
        .filter(Card.resident_id == resident_id)
        .all()
    )
    
    return {"cards": cards}

@router.get("/refused")
def list_refused_cards(
    db: Session = get_db_dependency(), 
    auth_token: str = Cookie(None)
):
    """ Returns distinct refused cards from the last 5 minutes, ordered by created descending. Requires cookie-based authentication. """
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
    refused_cards = (
        db.query(RefusedCard)
        .filter(RefusedCard.created >= five_minutes_ago)
        .order_by(RefusedCard.created.desc())
        .distinct(RefusedCard.rfid)
        .all()
    )
    
    if not refused_cards:
        raise HTTPException(status_code=404, detail="No refused cards found")
    
    return {"refused_cards": refused_cards}
