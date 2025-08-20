from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Security, Depends
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase, CardUpdate
from models import Card, RefusedCard, Resident
from crud import get_cards, create_card, log_refused_card, update_card_name
from dependencies import get_db_dependency, get_authenticated_active_resident
from security import verify_api_key

router = APIRouter(prefix="/cards", tags=["cards"])

@router.get("/", response_model=list[CardResponse])
def read_cards(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get all cards. Requires cookie-based authentication for management access."""
    return get_cards(db, skip=skip, limit=limit)

@router.post("/", response_model=CardResponse)
def create_new_card(
    card: CardBase, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Create a new card. Requires cookie-based authentication for management access."""
    return create_card(db, card)

@router.get("/authenticate/{rfid}")
def authenticate_card(
    rfid: str,
    station_id: str,
    db: Session = Depends(get_db_dependency),
    _: str = Security(verify_api_key),
):
    """Authenticate a card for station access. Requires API key authentication."""
    card = db.query(Card).filter(Card.rfid == rfid).first()
    
    if not card:
        log_refused_card(db, rfid, station_id)
        raise HTTPException(status_code=404, detail="Card not found")

    return {"resident_id": card.resident_id}

@router.post("/add_card/{station_id}", response_model=CardResponse)
def add_card(station_id: str, db: Session = Depends(get_db_dependency), _: Resident = Depends(get_authenticated_active_resident)):
    """ Finds the latest RefusedCard within 5 minutes and registers a new card for the given resident_id. """

    latest_refused_card_by_station = (
        db.query(RefusedCard)
        .filter(RefusedCard.station_id == station_id)
        .order_by(RefusedCard.created.desc())
        .first()
    )
    if not latest_refused_card_by_station:
        raise HTTPException(status_code=404, detail="No recent refused card found")

    new_card = Card(rfid=latest_refused_card_by_station.rfid, name=latest_refused_card_by_station.rfid, resident_id=_.id)
    db.add(new_card)
    
    # Delete the refused card after successfully adding it to the cards table
    db.delete(latest_refused_card_by_station)
    
    db.commit()
    db.refresh(new_card)

    return new_card

@router.get("/my_cards")
def get_my_cards(db: Session = Depends(get_db_dependency), _: Resident = Depends(get_authenticated_active_resident)):
    """ Returns all cards for the authenticated resident. """
    cards = (
        db.query(Card)
        .filter(Card.resident_id == _.id)
        .all()
    )
    
    return {"cards": cards}

@router.get("/refused")
def list_refused_cards(
    db: Session = Depends(get_db_dependency), 
    _: Resident = Depends(get_authenticated_active_resident)
):
    """ Returns distinct refused cards from the last 5 minutes, ordered by created descending. Requires cookie-based authentication. """
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

@router.put("/{rfid}/name", response_model=CardResponse)
def update_card_name_endpoint(
    rfid: str,
    card_update: CardUpdate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Update the name of a card. Only the card owner can update it."""
    # Check if the card exists and belongs to the authenticated resident
    card = db.query(Card).filter(Card.rfid == rfid, Card.resident_id == _.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    
    updated_card = update_card_name(db, rfid, card_update.name)
    if not updated_card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    return updated_card
