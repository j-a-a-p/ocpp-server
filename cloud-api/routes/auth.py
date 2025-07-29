from fastapi import APIRouter, HTTPException, Response, Cookie
from sqlalchemy.orm import Session
from dependencies import get_db_dependency
from crud import get_resident_by_email, update_resident
from invite import generate_invitation_token, send_login_email, generate_auth_token, verify_auth_token
from datetime import datetime, timedelta
from models import ResidentStatus, Resident
from constants import JWT_EXPIRATION_DAYS
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/request-access")
def request_access(email: str, db: Session = get_db_dependency()):
    """Request access by email - sends login link if resident exists and is active."""
    try:
        # Check if resident exists
        resident = get_resident_by_email(db, email)
        
        if not resident:
            # Resident doesn't exist, return success but don't reveal this
            logger.info(f"Login request for non-existent email: {email}")
            return {
                "success": True,
                "message": "If your email is registered, you will receive a login link shortly."
            }
        
        # Check if resident is active
        if resident.status != ResidentStatus.ACTIVE:
            logger.info(f"Login request for inactive resident: {email}")
            return {
                "success": True,
                "message": "If your email is registered, you will receive a login link shortly."
            }
        
        # Generate login token (1 hour expiration)
        login_token, expires_at = generate_invitation_token()
        expires_at = datetime.utcnow() + timedelta(hours=1)  # Override to 1 hour
        
        # Update resident with login token
        resident = update_resident(db, resident.id, {
            "login_token": login_token,
            "login_expires_at": expires_at
        })
        
        # Send login email
        try:
            send_login_email(resident.email, login_token)
            logger.info(f"Login email sent to {resident.email}")
        except Exception as e:
            logger.error(f"Failed to send login email to {resident.email}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to send login email. Please try again."
            )
        
        return {
            "success": True,
            "message": "If your email is registered, you will receive a login link shortly."
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error in request_access: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/login/{token}")
def login_resident(token: str, response: Response, db: Session = get_db_dependency()):
    """Login resident using login token."""
    try:
        # Find resident by login token
        resident = db.query(Resident).filter(Resident.login_token == token).first()
        
        if not resident:
            raise HTTPException(status_code=404, detail="Invalid login token")
        
        if resident.login_expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Login link has expired")
        
        if resident.status != ResidentStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Account is not active")
        
        # Clear login token
        resident = update_resident(db, resident.id, {
            "login_token": None,
            "login_expires_at": None
        })
        
        # Generate auth token
        auth_token = generate_auth_token(resident.id)
        
        # Set cookie
        response.set_cookie(
            key="auth_token",
            value=auth_token,
            httponly=True,
            #secure=True,  # Enable in production
            max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
        )
        
        return {"message": "Login successful"}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error in login_resident: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/validate")
def validate_token(auth_token: str = Cookie(None), db: Session = get_db_dependency()):
    """Validate the auth token and return resident info."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    if resident.status != ResidentStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account is not active")
    
    return {
        "resident_id": resident.id,
        "email": resident.email,
        "full_name": resident.full_name,
        "status": resident.status.value
    } 