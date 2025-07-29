from datetime import datetime, timedelta
import secrets
from constants import JWT_SECRET, INVITE_URL, INVITE_EXPIRATION_DAYS, JWT_EXPIRATION_DAYS
import jwt
from typing import Optional
from ses_mail_sender import SESEmailSender
import logging

# Set up logging
logger = logging.getLogger(__name__)

def generate_invitation_token() -> tuple[str, datetime]:
    """Generate a secure token and expiration date."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=INVITE_EXPIRATION_DAYS)
    return token, expires_at

def generate_auth_token(resident_id: int) -> str:
    """Generate a JWT token for authenticated residents."""
    return jwt.encode(
        {"resident_id": resident_id, "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)},
        JWT_SECRET,
        algorithm="HS256"
    )

def verify_auth_token(token: str) -> Optional[int]:
    """Verify and decode the JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("resident_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    
def send_invitation_email(email: str, token: str):
    """Send invitation email to the resident."""
    try:
        sender = SESEmailSender()
        activation_link = f"{INVITE_URL}/activate?token={token}"
        
        subject = "Invitation to Access System"
        body = f"""
        You have been invited to access the system. 
        Please click the following link to activate your account:
        
        {activation_link}
        
        This invitation will expire in {INVITE_EXPIRATION_DAYS} days.
        """
        
        logger.info(f"Sending invitation email to {email}")
        sender.send_email(
            sender="charger@aircokopen.nu",
            recipient=email,
            subject=subject,
            body=body
        )
        logger.info(f"Invitation email sent successfully to {email}")
        
    except Exception as e:
        logger.error(f"Failed to send invitation email to {email}: {str(e)}")
        raise Exception(f"Failed to send invitation email: {str(e)}")

def send_login_email(email: str, token: str):
    """Send login email to the resident."""
    try:
        sender = SESEmailSender()
        login_link = f"{INVITE_URL}/login?token={token}"
        
        subject = "Login to Resident Portal"
        body = f"""
        You have requested to log in to the resident portal.
        Please click the following link to access your account:
        
        {login_link}
        
        This login link will expire in 1 hour.
        """
        
        logger.info(f"Sending login email to {email}")
        sender.send_email(
            sender="charger@aircokopen.nu",
            recipient=email,
            subject=subject,
            body=body
        )
        logger.info(f"Login email sent successfully to {email}")
        
    except Exception as e:
        logger.error(f"Failed to send login email to {email}: {str(e)}")
        raise Exception(f"Failed to send login email: {str(e)}")
