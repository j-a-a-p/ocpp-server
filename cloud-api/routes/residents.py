from fastapi import APIRouter, HTTPException, Response, Cookie, Depends
from sqlalchemy.orm import Session
from schemas import ResidentResponse, ResidentBase
from crud import get_residents, get_resident, update_resident, create_invited_resident
from dependencies import get_db_dependency, get_authenticated_active_resident
from invite import generate_invitation_token, send_invitation_email, generate_auth_token, verify_auth_token
from datetime import datetime
from models import Resident, ResidentStatus
from constants import JWT_EXPIRATION_DAYS
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/residents", tags=["residents"])

@router.get("/", response_model=list[ResidentResponse])
def read_residents(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get all residents. Requires cookie-based authentication for management access."""
    return get_residents(db, skip=skip, limit=limit)

@router.get("/{resident_id}", response_model=ResidentResponse)
def read_resident(
    resident_id: int, 
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    return resident

@router.post("/", response_model=ResidentResponse)
def create_new_resident(
    resident: ResidentBase, 
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Create a new resident. Requires cookie-based authentication for management access."""
    # Check if resident with this email already exists
    existing_resident = db.query(Resident).filter(Resident.email == resident.email).first()
    if existing_resident:
        raise HTTPException(status_code=400, detail="Resident with this email already exists")
    
    # Generate invitation token
    invite_token, expires_at = generate_invitation_token()
    
    # Create invited resident
    new_resident = create_invited_resident(db, resident, invite_token, expires_at)
    
    # Send invitation email
    try:
        send_invitation_email(resident.email, invite_token)
        logger.info(f"Invitation email sent to {resident.email}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {resident.email}: {str(e)}")
        # Don't fail the request if email fails, just log it
        # In production, you might want to handle this differently
    
    return new_resident

@router.post("/{resident_id}/send-invitation", response_model=ResidentResponse)
def send_invitation(
    resident_id: int, 
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Send invitation email to a resident. Requires cookie-based authentication for management access."""
    # Get the resident
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    # Check if resident already has an active invitation
    if resident.invite_token and resident.invite_expires_at and resident.invite_expires_at > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Resident already has an active invitation")
    
    # Generate new invitation token
    invite_token, expires_at = generate_invitation_token()
    
    # Update resident with new invitation token
    resident = update_resident(db, resident_id, {
        "invite_token": invite_token,
        "invite_expires_at": expires_at
    })
    
    # Send invitation email
    try:
        send_invitation_email(resident.email, invite_token)
        logger.info(f"Invitation email sent to {resident.email}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {resident.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to send invitation email. Please try again."
        )
    
    return resident

@router.post("/activate/{token}")
def activate_resident(token: str, response: Response, db: Session = get_db_dependency()):
    """Activate a resident account using invitation token. No authentication required as this is the activation endpoint."""
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
