from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Security, Depends
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase, CardUpdate, CardEnabledUpdate
from models import Card, RefusedCard, Resident, ResidentStatus, Role
from crud import get_cards, create_card, log_refused_card, update_card_name
from dependencies import get_db_dependency, get_authenticated_active_resident, require_manager, require_resident
from security import verify_api_key
from tariff import local_today

router = APIRouter(prefix="/cards", tags=["cards"])

@router.get("/", response_model=list[CardResponse])
def read_cards(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Get all cards. Requires cookie-based authentication for management access."""
    return get_cards(db, skip=skip, limit=limit)

@router.post("/", response_model=CardResponse)
def create_new_card(
    card: CardBase, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
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

    # Only an active account with the resident role inside their residency window may charge,
    # with a card that is not switched off. The card is known, so it is not logged as refused.
    owner = card.resident
    if not card.enabled or owner is None or not owner.can_charge_on(local_today()):
        raise HTTPException(status_code=404, detail="Card not found")

    return {"resident_id": card.resident_id}

@router.post("/add_card/{station_id}", response_model=CardResponse)
def add_card(station_id: str, db: Session = Depends(get_db_dependency), resident: Resident = Depends(require_resident)):
    """ Finds the latest RefusedCard within 5 minutes and registers a new card for the given resident_id. """
    state = resident.residency_state_on(local_today())
    if state == "upcoming":
        raise HTTPException(status_code=403, detail="Your residency has not started yet")
    if state == "ended":
        raise HTTPException(status_code=403, detail="Your residency has ended")

    latest_refused_card_by_station = (
        db.query(RefusedCard)
        .filter(RefusedCard.station_id == station_id)
        .order_by(RefusedCard.created.desc())
        .first()
    )
    if not latest_refused_card_by_station:
        raise HTTPException(status_code=404, detail="No recent refused card found")
    if db.query(Card).filter(Card.rfid == latest_refused_card_by_station.rfid).first():
        # Refused because it is switched off, or its owner cannot charge: it is registered already.
        raise HTTPException(status_code=409, detail="This card is already registered")

    new_card = Card(rfid=latest_refused_card_by_station.rfid, name=latest_refused_card_by_station.rfid, resident_id=resident.id)
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
        # A card that is registered cannot be added again, whatever the reason it was refused (for example switched off).
        .filter(RefusedCard.rfid.not_in(db.query(Card.rfid)))
        .order_by(RefusedCard.created.desc())
        .distinct(RefusedCard.rfid)
        .all()
    )
    
    if not refused_cards:
        raise HTTPException(status_code=404, detail="No refused cards found")
    
    return {"refused_cards": refused_cards}

@router.put("/{rfid}/enabled", response_model=CardResponse)
def update_card_enabled_endpoint(
    rfid: str,
    update: CardEnabledUpdate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Switch a card off or on again, for example when it was lost. A card that is off cannot start a charge.
    Only managers can do this: the owner of a card cannot switch it back on. Requires the manager role."""
    card = db.query(Card).filter(Card.rfid == rfid).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    card.enabled = update.enabled
    db.commit()
    db.refresh(card)
    return card

@router.put("/{rfid}/name", response_model=CardResponse)
def update_card_name_endpoint(
    rfid: str,
    card_update: CardUpdate,
    db: Session = Depends(get_db_dependency),
    resident: Resident = Depends(require_resident)
):
    """Update the name of a card. Only the card owner can update it, while their residency has not ended."""
    if resident.residency_state_on(local_today()) == "ended":
        raise HTTPException(status_code=403, detail="Your residency has ended")

    # Check if the card exists and belongs to the authenticated resident
    card = db.query(Card).filter(Card.rfid == rfid, Card.resident_id == resident.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or access denied")
    
    updated_card = update_card_name(db, rfid, card_update.name)
    if not updated_card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    return updated_card
