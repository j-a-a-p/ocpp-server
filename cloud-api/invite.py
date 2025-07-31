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
        # Ensure INVITE_URL has a trailing slash
        base_url = INVITE_URL.rstrip('/')
        activation_link = f"{base_url}/activate?token={token}"
        
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

def send_login_email(email: str, token: str, flow: str = "resident"):
    """Send login email to the resident."""
    try:
        sender = SESEmailSender()
        
        # Extract base domain from INVITE_URL (remove /resident-ui if present)
        base_url = INVITE_URL.rstrip('/')
        if base_url.endswith('/resident-ui'):
            base_url = base_url[:-len('/resident-ui')]
        
        # Generate different login links based on flow
        if flow == "management":
            # For management flow, use the base URL with management-ui path
            login_link = f"{base_url}/management-ui/login?token={token}"
            subject = "Login to Management Portal"
            body = f"""
            You have requested to log in to the management portal.
            Please click the following link to access your account:
            
            {login_link}
            
            This login link will expire in 1 hour.
            """
        else:
            # For resident flow, use the resident-ui path
            login_link = f"{base_url}/resident-ui/login?token={token}"
            subject = "Login to Resident Portal"
            body = f"""
            You have requested to log in to the resident portal.
            Please click the following link to access your account:
            
            {login_link}
            
            This login link will expire in 1 hour.
            """
        
        logger.info(f"Sending login email to {email} for {flow} flow")
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
