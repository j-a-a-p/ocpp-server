from fastapi import APIRouter, HTTPException, Response, Depends
from sqlalchemy.orm import Session
from schemas import ResidentResponse, ResidentCreate, ResidentUpdate, HouseholdMemberCreate, AddressOption
from crud import (
    get_residents, get_resident, update_resident, create_invited_resident,
    normalize_address, get_address_options, get_household_members,
    count_other_active_managers, check_household_date_conflict,
)
from dependencies import get_db_dependency, require_manager, require_resident
from invite import generate_invitation_token, send_invitation_email, generate_auth_token
from datetime import datetime
from models import Household, Resident, ResidentStatus, Role
from tariff import local_today
from constants import JWT_EXPIRATION_DAYS
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/residents", tags=["residents"])


def invite_account(
    db: Session,
    email: str,
    full_name: str,
    roles,
    address=None,
    household_id=None,
    is_main_member: bool = False,
    start_date=None,
) -> Resident:
    """Create an invited account and mail the invitation. The account exists even when the mail fails."""
    if db.query(Resident).filter(Resident.email == email).first():
        raise HTTPException(status_code=400, detail="Resident with this email already exists")

    invite_token, expires_at = generate_invitation_token()
    new_resident = create_invited_resident(
        db, full_name, email, roles, invite_token, expires_at,
        address=address, household_id=household_id, is_main_member=is_main_member, start_date=start_date,
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
    """The household members of the logged in main member."""
    return get_household_members(db, resident)

@router.post("/household-members", response_model=ResidentResponse)
def invite_household_member(
    member: HouseholdMemberCreate,
    db: Session = Depends(get_db_dependency),
    resident: Resident = Depends(require_resident)
):
    """A main member invites a member of the household. The member joins the same household (address and dates)
    and can charge, but cannot invite anyone themselves."""
    if not resident.is_main_member:
        raise HTTPException(status_code=403, detail="A household member cannot invite other household members")
    if not resident.household or not resident.household.has_address():
        raise HTTPException(status_code=400, detail="Your address is not known yet, ask a manager to add it")
    if resident.household.state_on(local_today()) == "ended":
        raise HTTPException(status_code=403, detail="Your residency has ended")

    return invite_account(
        db, member.email, member.full_name, [Role.RESIDENT],
        household_id=resident.household_id, is_main_member=False,
    )

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
    """Invite a new account with the given roles. A resident starts a new household with a mandatory start date
    and becomes its main member. Requires the manager role."""
    if db.query(Resident).filter(Resident.email == resident.email).first():
        raise HTTPException(status_code=400, detail="Resident with this email already exists")

    address = None
    start_date = None
    if Role.RESIDENT in resident.roles:
        address = normalize_address(
            db, resident.street_name, resident.house_number, resident.house_number_suffix,
            resident.zip_code, resident.city,
        )
        start_date = resident.residency_start_date
        conflict = check_household_date_conflict(db, address, start_date, None)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)
    return invite_account(
        db, resident.email, resident.full_name, resident.roles,
        address=address, is_main_member=address is not None, start_date=start_date,
    )

@router.put("/{resident_id}", response_model=ResidentResponse)
def update_existing_resident(
    resident_id: int,
    update: ResidentUpdate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Change the name, roles, address and residency start date of an account. Requires the manager role."""
    resident = get_resident(db, resident_id)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    if resident.is_household_member:
        # A household member lives in their household: only the name can change.
        if sorted(role.value for role in update.roles) != resident.role_names:
            raise HTTPException(status_code=400, detail="The roles of a household member cannot be changed")
        resident.full_name = update.full_name
        db.commit()
        return get_resident(db, resident.id)

    new_roles = set(update.roles)

    if resident.has_role(Role.MANAGER) and Role.MANAGER not in new_roles \
            and count_other_active_managers(db, resident.id) == 0:
        raise HTTPException(status_code=409, detail="There must always be at least one manager")

    other_members = get_household_members(db, resident)
    if resident.has_role(Role.RESIDENT) and Role.RESIDENT not in new_roles and other_members:
        raise HTTPException(status_code=409, detail="This resident still has household members, remove their access first")

    if Role.RESIDENT in new_roles:
        address = normalize_address(
            db, update.street_name, update.house_number, update.house_number_suffix,
            update.zip_code, update.city,
        )
        if resident.household is None:
            start_date = update.residency_start_date or local_today()
            conflict = check_household_date_conflict(db, address, start_date, None)
            if conflict:
                raise HTTPException(status_code=409, detail=conflict)
            household = Household(start_date=start_date, end_date=None)
            household.set_address(address)
            db.add(household)
            db.flush()
            resident.household_id = household.id
            resident.is_main_member = True
        else:
            household = resident.household
            new_start = update.residency_start_date if update.residency_start_date is not None else household.start_date
            conflict = check_household_date_conflict(
                db, address, new_start, household.end_date, exclude_household_id=household.id,
            )
            if conflict:
                status_code = 400 if "cannot be before" in conflict else 409
                raise HTTPException(status_code=status_code, detail=conflict)
            household.set_address(address)
            household.start_date = new_start
    else:
        old_household = resident.household
        resident.household_id = None
        resident.is_main_member = False
        db.flush()
        if old_household is not None and not other_members:
            db.delete(old_household)

    resident.full_name = update.full_name
    resident.set_roles(new_roles)
    db.commit()
    return get_resident(db, resident.id)

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
