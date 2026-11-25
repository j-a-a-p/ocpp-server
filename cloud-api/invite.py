from datetime import datetime, timedelta
import secrets
from constants import JWT_SECRET, INVITE_URL, INVITE_EXPIRATION_DAYS, JWT_EXPIRATION_DAYS
import jwt
from typing import Iterable, Optional
from ses_mail_sender import SESEmailSender
from email_templates import render_action_email
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
    
# What each role gets in the invitation: the portal to use and what it is for. A new role needs an entry here.
ROLE_PORTALS = {
    "resident": {
        "name": "Resident portal",
        "path": "resident-ui",
        "purpose": "see your charging sessions, what you pay per kWh and manage your charging cards",
    },
    "manager": {
        "name": "Management portal",
        "path": "management-ui",
        "purpose": "manage residents, stations and charging prices, and see all charges",
    },
}


def _site_url() -> str:
    """The address of the site, without the portal: INVITE_URL points at the resident portal."""
    base_url = INVITE_URL.rstrip('/')
    if base_url.endswith('/resident-ui'):
        base_url = base_url[:-len('/resident-ui')]
    return base_url


def _invited_portals(roles: Iterable) -> list[dict]:
    """The portals of the roles, in a fixed order. Accounts without a known role are treated as residents."""
    names = {str(getattr(role, "value", role)) for role in roles}
    portals = [portal for role, portal in ROLE_PORTALS.items() if role in names]
    return portals or [ROLE_PORTALS["resident"]]


def invitation_content(roles: Iterable) -> dict:
    """The subject, the portal in the header, the text and the portal links of an invitation for these roles."""
    portals = _invited_portals(roles)
    site_url = _site_url()
    links = [(portal["name"], f"{site_url}/{portal['path']}/") for portal in portals]

    if len(portals) == 1:
        portal = portals[0]
        subject = f"You are invited to the Charger {portal['name'].lower()}"
        header = portal["name"]
        paragraphs = [f"You have been invited to the {portal['name'].lower()}. There you can {portal['purpose']}."]
    else:
        subject = "You are invited to Charger"
        header = " and ".join(portal["name"] for portal in portals)
        paragraphs = [
            "You have been invited to Charger with more than one role.",
            *[f"In the {portal['name'].lower()} you can {portal['purpose']}." for portal in portals],
        ]
    paragraphs.append("Activate your account to get started.")
    return {"subject": subject, "portal": header, "paragraphs": paragraphs, "portal_links": links}


def send_invitation_email(email: str, token: str, roles: Iterable = ("resident",)):
    """Send the invitation email. The text and the links follow the roles of the account."""
    try:
        sender = SESEmailSender()
        # The account is activated in the resident portal, whatever the roles are.
        activation_link = f"{INVITE_URL.rstrip('/')}/activate?token={token}"

        content = invitation_content(roles)
        subject = content["subject"]
        body, html_body = render_action_email(
            portal=content["portal"],
            heading="Welcome to Charger",
            paragraphs=content["paragraphs"],
            button_label="Activate my account",
            link=activation_link,
            note=f"This invitation expires in {INVITE_EXPIRATION_DAYS} days.",
            portal_links=content["portal_links"],
        )

        logger.info(f"Sending invitation email to {email}")
        sender.send_email(
            sender="charger@aircokopen.nu",
            recipient=email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
        logger.info(f"Invitation email sent successfully to {email}")

    except Exception as e:
        logger.error(f"Failed to send invitation email to {email}: {str(e)}")
        raise Exception(f"Failed to send invitation email: {str(e)}")

def send_login_email(email: str, token: str, flow: str = "resident"):
    """Send login email to the resident."""
    try:
        sender = SESEmailSender()

        base_url = _site_url()

        # Generate different login links based on flow
        if flow == "management":
            portal = "Management portal"
            login_link = f"{base_url}/management-ui/login?token={token}"
            subject = "Login to Management Portal"
            intro = "Use the button below to sign in to the management portal."
        else:
            portal = "Resident portal"
            login_link = f"{base_url}/resident-ui/login?token={token}"
            subject = "Login to Resident Portal"
            intro = "Use the button below to sign in to the resident portal."

        body, html_body = render_action_email(
            portal=portal,
            heading="Your sign-in link",
            paragraphs=[intro, "There is no password: the link signs you in once."],
            button_label="Sign in",
            link=login_link,
            note="This link expires in 1 hour and works only once.",
        )

        logger.info(f"Sending login email to {email} for {flow} flow")
        sender.send_email(
            sender="charger@aircokopen.nu",
            recipient=email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
        logger.info(f"Login email sent successfully to {email}")

    except Exception as e:
        logger.error(f"Failed to send login email to {email}: {str(e)}")
        raise Exception(f"Failed to send login email: {str(e)}")
