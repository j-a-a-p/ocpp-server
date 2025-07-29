from datetime import datetime, timedelta
from fastapi import APIRouter, Cookie, HTTPException, Security
from sqlalchemy.orm import Session
from schemas import CardResponse, CardBase
from models import Card, FailedAuthentication
from crud import get_cards, create_card, log_failed_authentication
from dependencies import get_db_dependency
from security import verify_api_key
from invite import verify_auth_token

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

    return {"resident_id": card.resident_id}

@router.post("/add_card/{station_id}", response_model=CardResponse)
def add_card(station_id: str, db: Session = get_db_dependency(), auth_token: str = Cookie(None)):
    """ Finds the latest FailedAuthentication within 5 minutes and registers a new card for the given resident_id. """

    if not auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized: Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Unauthorized: wrong credentials")


    latest_failed_auth_by_station = (
        db.query(FailedAuthentication)
        .filter(FailedAuthentication.station_id == station_id)
        .order_by(FailedAuthentication.created.desc())
        .first()
    )
    if not latest_failed_auth_by_station:
        raise HTTPException(status_code=404, detail="No recent failed authentication found")

    new_card = Card(rfid=latest_failed_auth_by_station.rfid, resident_id=resident_id)
    db.add(new_card)
    db.commit()
    db.refresh(new_card)

    return new_card

@router.get("/refused")
def list_refused_cards(db: Session = get_db_dependency(), auth_token: str = Cookie(None)):
    """ Returns distinct failed authentications from the last 5 minutes, ordered by created descending. """
    #if not verify_auth_token(auth_token):
    #    raise HTTPException(status_code=401, detail="Unauthorized: please login (again).")
    
    five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
    refused_cards = (
        db.query(FailedAuthentication)
        .filter(FailedAuthentication.created >= five_minutes_ago)
        .order_by(FailedAuthentication.created.desc())
        .distinct(FailedAuthentication.rfid)
        .all()
    )
    
    if not refused_cards:
        raise HTTPException(status_code=404, detail="No refused cards found")
    
    return {"refused_cards": refused_cards}
