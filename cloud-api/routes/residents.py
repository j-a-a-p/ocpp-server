from fastapi import APIRouter, HTTPException, Response
from sqlalchemy.orm import Session
from schemas import ResidentResponse, ResidentBase
from crud import get_residents, get_resident, update_resident, create_invited_resident
from dependencies import get_db_dependency
from invite import generate_invitation_token, send_invitation_email, generate_auth_token
from datetime import datetime
from models import Resident, ResidentStatus
from constants import JWT_EXPIRATION_DAYS

router = APIRouter(prefix="/residents", tags=["residents"])

@router.get("/", response_model=list[ResidentResponse])
def read_residents(skip: int = 0, limit: int = 100, db: Session = get_db_dependency()):
    return get_residents(db, skip=skip, limit=limit)

@router.get("/{resident_id}", response_model=ResidentResponse)
def read_resident(resident_id: int, db: Session = get_db_dependency()):
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    return resident

@router.post("/", response_model=ResidentResponse)
def create_new_resident(resident: ResidentBase, db: Session = get_db_dependency()):
    invite_token, expires_at = generate_invitation_token()
    new_resident = create_invited_resident(db, resident, invite_token, expires_at)

    if not new_resident:
        raise HTTPException(status_code=400, detail="Reference does not exist")
    
    send_invitation_email(new_resident.email, invite_token)
    
    return new_resident

@router.post("/{resident_id}/send-invitation", response_model=ResidentResponse)
def send_invitation(resident_id: int, db: Session = get_db_dependency()):
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    if resident.status == "active":
        raise HTTPException(status_code=400, detail="Resident is already active")
    
    invite_token, expires_at = generate_invitation_token()
    resident = update_resident(db, resident_id, {
        "invite_token": invite_token,
        "invite_expires_at": expires_at
    })

    send_invitation_email(resident.email, invite_token)
    
    return resident

@router.post("/activate/{token}")
def activate_resident(token: str, response: Response, db: Session = get_db_dependency()):
    resident = db.query(Resident).filter(Resident.invite_token == token).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Invalid invitation token")
    
    if resident.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    resident = update_resident(db, resident.id, {
        "status": ResidentStatus.ACTIVE,
        "invite_token": None,
        "invite_expires_at": None
    })
    
    auth_token = generate_auth_token(resident.id)
    
    # Set cookie
    response.set_cookie(
        key="auth_token",
        value=auth_token,
        httponly=True,
        #secure=True,  # Enable in production
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return {"message": "Account activated successfully"}
