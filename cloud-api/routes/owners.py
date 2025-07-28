from fastapi import APIRouter, HTTPException, Response
from sqlalchemy.orm import Session
from schemas import OwnerResponse, OwnerBase
from crud import get_owners, get_owner, update_owner, create_invited_owner
from dependencies import get_db_dependency
from invite import generate_invitation_token, send_invitation_email, generate_auth_token
from datetime import datetime
from models import Owner, OwnerStatus
from constants import JWT_EXPIRATION_DAYS

router = APIRouter(prefix="/owners", tags=["owners"])

@router.get("/", response_model=list[OwnerResponse])
def read_owners(skip: int = 0, limit: int = 100, db: Session = get_db_dependency()):
    return get_owners(db, skip=skip, limit=limit)

@router.get("/{owner_id}", response_model=OwnerResponse)
def read_owner(owner_id: int, db: Session = get_db_dependency()):
    owner = get_owner(db, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    return owner

@router.post("/", response_model=OwnerResponse)
def create_new_owner(owner: OwnerBase, db: Session = get_db_dependency()):
    invite_token, expires_at = generate_invitation_token()
    new_owner = create_invited_owner(db, owner, invite_token, expires_at)

    if not new_owner:
        raise HTTPException(status_code=400, detail="Reference does not exist")
    
    send_invitation_email(new_owner.email, invite_token)
    
    return new_owner

@router.post("/{owner_id}/send-invitation", response_model=OwnerResponse)
def send_invitation(owner_id: int, db: Session = get_db_dependency()):
    owner = get_owner(db, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    
    if owner.status == "active":
        raise HTTPException(status_code=400, detail="Owner is already active")
    
    invite_token, expires_at = generate_invitation_token()
    owner = update_owner(db, owner_id, {
        "invite_token": invite_token,
        "invite_expires_at": expires_at
    })

    send_invitation_email(owner.email, invite_token)
    
    return owner

@router.post("/activate/{token}")
def activate_owner(token: str, response: Response, db: Session = get_db_dependency()):
    owner = db.query(Owner).filter(Owner.invite_token == token).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Invalid invitation token")
    
    if owner.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    owner = update_owner(db, owner.id, {
        "status": OwnerStatus.ACTIVE,
        "invite_token": None,
        "invite_expires_at": None
    })
    
    auth_token = generate_auth_token(owner.id)
    
    # Set cookie
    response.set_cookie(
        key="auth_token",
        value=auth_token,
        httponly=True,
        #secure=True,  # Enable in production
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return {"message": "Account activated successfully"}
