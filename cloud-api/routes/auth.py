from fastapi import APIRouter, HTTPException, Request, Response, Query, Depends
from sqlalchemy.orm import Session
from dependencies import get_db_dependency, get_authenticated_active_resident
from crud import get_resident_by_email, update_resident
from invite import generate_invitation_token, send_login_email, generate_auth_token, verify_auth_token
from datetime import datetime, timedelta
from models import ResidentStatus, Resident, Role
from constants import JWT_EXPIRATION_DAYS
from security import request_is_https
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_LINK_VALID = timedelta(hours=1)
# A new link is only mailed this long after the previous one, so the endpoint cannot be used to flood a mailbox.
LOGIN_LINK_COOLDOWN = timedelta(minutes=1)

@router.post("/request-access")
def request_access(email: str, flow: str = Query("resident", description="Flow type: resident or management"), db: Session = Depends(get_db_dependency)):
    """Request access by email - sends login link if resident exists and is active."""
    try:
        # Validate flow parameter
        if flow not in ["resident", "management"]:
            raise HTTPException(status_code=400, detail="Invalid flow parameter. Must be 'resident' or 'management'")
        
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
        
        # The management portal is for managers only. Do not reveal whether the account exists.
        if flow == "management" and not resident.has_role(Role.MANAGER):
            logger.info(f"Management login request for {email}, who is not a manager")
            return {
                "success": True,
                "message": "If your email is registered, you will receive a login link shortly."
            }

        # A link was mailed a moment ago: it is still valid, do not mail another one.
        if (resident.login_token and resident.login_expires_at
                and resident.login_expires_at > datetime.utcnow() + LOGIN_LINK_VALID - LOGIN_LINK_COOLDOWN):
            logger.info(f"Login request for {resident.email} ignored, a link was sent less than a minute ago")
            return {
                "success": True,
                "message": "If your email is registered, you will receive a login link shortly."
            }

        # Generate login token (1 hour expiration)
        login_token, expires_at = generate_invitation_token()
        expires_at = datetime.utcnow() + LOGIN_LINK_VALID
        
        # Update resident with login token
        resident = update_resident(db, resident.id, {
            "login_token": login_token,
            "login_expires_at": expires_at
        })
        
        # Send login email with flow parameter
        try:
            send_login_email(resident.email, login_token, flow)
            logger.info(f"Login email sent to {resident.email} for {flow} flow")
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
def login_resident(token: str, request: Request, response: Response, db: Session = Depends(get_db_dependency)):
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
            secure=request_is_https(request),
            samesite="lax",
            max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
        )
        
        return {"message": "Login successful"}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error in login_resident: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/logout")
def logout(request: Request, response: Response):
    """Log out: remove the auth cookie. It is httponly, so only the server can do this."""
    response.delete_cookie(
        key="auth_token",
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
    )
    return {"message": "Logged out"}

@router.get("/validate")
def validate_token(
    flow: str = Query("resident", description="Portal that asks: resident or management. The management portal needs the manager role."),
    resident: Resident = Depends(get_authenticated_active_resident),
):
    """Validate the auth token and return resident info."""
    if flow == "management" and not resident.has_role(Role.MANAGER):
        raise HTTPException(status_code=403, detail="This requires the manager role")
    return {
        "resident_id": resident.id,
        "email": resident.email,
        "full_name": resident.full_name,
        "status": resident.status.value,
        "roles": resident.role_names,
        "household_id": resident.household_id,
        "is_main_member": resident.is_main_member,
        "household_head_id": resident.household_head_id,
        "residency_start_date": resident.residency_start_date.isoformat() if resident.residency_start_date else None,
        "residency_end_date": resident.residency_end_date.isoformat() if resident.residency_end_date else None,
        "residency_state": resident.residency_state,
        "street_name": resident.street_name,
        "house_number": resident.house_number,
        "house_number_suffix": resident.house_number_suffix,
        "zip_code": resident.zip_code,
        "city": resident.city,
    } 