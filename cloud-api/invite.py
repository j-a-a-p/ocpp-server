from datetime import datetime, timedelta
import secrets
from constants import JWT_SECRET, INVITE_URL, INVITE_EXPIRATION_DAYS, JWT_EXPIRATION_DAYS
import jwt
from typing import Optional
from ses_mail_sender import SESEmailSender

def generate_invitation_token() -> tuple[str, datetime]:
    """Generate a secure token and expiration date."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=INVITE_EXPIRATION_DAYS)
    return token, expires_at

def generate_auth_token(owner_id: int) -> str:
    """Generate a JWT token for authenticated owners."""
    return jwt.encode(
        {"owner_id": owner_id, "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)},
        JWT_SECRET,
        algorithm="HS256"
    )

def verify_auth_token(token: str) -> Optional[int]:
    """Verify and decode the JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("owner_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    
def send_invitation_email(email: str, token: str):
    sender = SESEmailSender()
    activation_link = f"{INVITE_URL}/activate?token={token}"
    
    subject = "Invitation to Access System"
    body = f"""
    You have been invited to access the system. 
    Please click the following link to activate your account:
    
    {activation_link}
    
    This invitation will expire in {INVITE_EXPIRATION_DAYS} days.
    """
    
    sender.send_email(
        sender="charger@aircokopen.nu",
        recipient=email,
        subject=subject,
        body=body
    )
