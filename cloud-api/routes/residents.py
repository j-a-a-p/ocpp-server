from fastapi import APIRouter, HTTPException, Response, Depends
from sqlalchemy.orm import Session
from schemas import ResidentResponse, ResidentCreate, ResidentUpdate, HouseholdMemberCreate, AddressOption
from crud import (
    get_residents, get_resident, update_resident, create_invited_resident,
    normalize_address, get_address_options, get_household_members, count_other_active_managers, EMPTY_ADDRESS,
)
from dependencies import get_db_dependency, require_manager, require_resident
from invite import generate_invitation_token, send_invitation_email, generate_auth_token
from datetime import datetime
from models import Resident, ResidentStatus, Role
from constants import JWT_EXPIRATION_DAYS
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/residents", tags=["residents"])


def _invite(db: Session, email: str, full_name: str, roles, address=None, household_head_id=None) -> Resident:
    """Create an invited account and mail the invitation. The account exists even when the mail fails."""
    if db.query(Resident).filter(Resident.email == email).first():
        raise HTTPException(status_code=400, detail="Resident with this email already exists")

    invite_token, expires_at = generate_invitation_token()
    new_resident = create_invited_resident(
        db, full_name, email, roles, invite_token, expires_at,
        address=address, household_head_id=household_head_id,
    )

    try:
        send_invitation_email(email, invite_token, new_resident.role_names)
        logger.info(f"Invitation email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {email}: {str(e)}")
        # Don't fail the request if email fails, the invitation can be sent again

    return new_resident


@router.get("/", response_model=list[ResidentResponse])
def read_residents(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Get all residents. Requires the manager role."""
    return get_residents(db, skip=skip, limit=limit)

# The fixed paths come before /{resident_id}, which would otherwise try to read them as an id.

@router.get("/address-options", response_model=list[AddressOption])
def read_address_options(
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """The distinct addresses in use, for the drop downs of the invite form. Requires the manager role."""
    return [
        AddressOption(street_name=street, house_number=number, house_number_suffix=suffix, zip_code=zip_code, city=city)
        for street, number, suffix, zip_code, city in get_address_options(db)
    ]

@router.get("/household-members", response_model=list[ResidentResponse])
def read_household_members(
    db: Session = Depends(get_db_dependency),
    resident: Resident = Depends(require_resident)
):
    """The household members that the logged in resident invited."""
    return get_household_members(db, resident.id)

@router.post("/household-members", response_model=ResidentResponse)
def invite_household_member(
    member: HouseholdMemberCreate,
    db: Session = Depends(get_db_dependency),
    resident: Resident = Depends(require_resident)
):
    """A resident invites a member of the household. The member lives at the address of the resident, whatever
    the request says, and is a resident too: they can charge, but cannot invite anyone themselves."""
    if resident.is_household_member:
        raise HTTPException(status_code=403, detail="A household member cannot invite other household members")
    if not (resident.street_name and resident.house_number and resident.zip_code and resident.city):
        raise HTTPException(status_code=400, detail="Your address is not known yet, ask a manager to add it")

    address = resident.address_of()
    return _invite(db, member.email, member.full_name, [Role.RESIDENT], address=address, household_head_id=resident.id)

@router.get("/{resident_id}", response_model=ResidentResponse)
def read_resident(
    resident_id: int, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    return resident

@router.post("/", response_model=ResidentResponse)
def create_new_resident(
    resident: ResidentCreate, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Invite a new account with the given roles. A resident needs an address. Requires the manager role."""
    address = None
    if Role.RESIDENT in resident.roles:
        address = normalize_address(db, resident.street_name, resident.house_number, resident.house_number_suffix, resident.zip_code, resident.city)
    return _invite(db, resident.email, resident.full_name, resident.roles, address=address)

@router.put("/{resident_id}", response_model=ResidentResponse)
def update_existing_resident(
    resident_id: int,
    update: ResidentUpdate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Change the name, roles and address of an account. Requires the manager role."""
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    if resident.is_household_member:
        # A household member is a resident at the address of their head: only the name can change.
        if sorted(role.value for role in update.roles) != resident.role_names:
            raise HTTPException(status_code=400, detail="The roles of a household member cannot be changed")
        resident.full_name = update.full_name
        db.commit()
        db.refresh(resident)
        return resident

    new_roles = set(update.roles)

    if resident.has_role(Role.MANAGER) and Role.MANAGER not in new_roles \
            and count_other_active_managers(db, resident.id) == 0:
        raise HTTPException(status_code=409, detail="There must always be at least one manager")

    household = get_household_members(db, resident.id)
    if resident.has_role(Role.RESIDENT) and Role.RESIDENT not in new_roles and household:
        raise HTTPException(status_code=409, detail="This resident still has household members, remove their access first")

    if Role.RESIDENT in new_roles:
        address = normalize_address(db, update.street_name, update.house_number, update.house_number_suffix, update.zip_code, update.city)
    else:
        address = EMPTY_ADDRESS  # only residents have an address

    resident.full_name = update.full_name
    resident.set_roles(new_roles)
    resident.set_address(address)
    for member in household:
        member.set_address(address)
    db.commit()
    db.refresh(resident)
    return resident

@router.post("/{resident_id}/send-invitation", response_model=ResidentResponse)
def send_invitation(
    resident_id: int, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Send the invitation again, also while the previous one is still valid (it was lost, or ended up in the
    spam folder). The link of the previous mail stops working. Requires the manager role."""
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    if resident.status != ResidentStatus.INVITED:
        raise HTTPException(status_code=400, detail="This account is already active, there is nothing to invite")

    invite_token, expires_at = generate_invitation_token()
    resident = update_resident(db, resident_id, {
        "invite_token": invite_token,
        "invite_expires_at": expires_at
    })

    try:
        send_invitation_email(resident.email, invite_token, resident.role_names)
        logger.info(f"Invitation email sent to {resident.email}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {resident.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to send invitation email. Please try again."
        )
    
    return resident

@router.post("/activate/{token}")
def activate_resident(token: str, response: Response, db: Session = Depends(get_db_dependency)):
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
    
    response.set_cookie(
        key="auth_token",
        value=auth_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    # The roles tell the portal where to send the new account: a manager who cannot charge has nothing to do in the resident portal.
    return {"message": "Account activated successfully", "roles": resident.role_names}
