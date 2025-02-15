from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase
from models import Card
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

    if not card.status:
        log_failed_authentication(db, rfid, station_id)
        raise HTTPException(status_code=403, detail="Card is inactive")

    return {"owner_id": card.owner_id, "status": "active"}