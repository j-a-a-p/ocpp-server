from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from schemas import HouseholdMemberCreate, HouseholdTerminationUpdate, ResidentResponse
from crud import get_household, get_resident, check_household_date_conflict
from dependencies import get_db_dependency, require_manager
from models import Resident, Role
from routes.residents import invite_account
from tariff import local_today

router = APIRouter(prefix="/households", tags=["households"])


@router.post("/{household_id}/members", response_model=ResidentResponse)
def add_household_member(
    household_id: int,
    member: HouseholdMemberCreate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager),
):
    """Invite a new household member into an active or upcoming household. Requires the manager role."""
    household = get_household(db, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    if not household.has_address():
        raise HTTPException(status_code=400, detail="This household has no address yet")
    if household.state_on(local_today()) == "ended":
        raise HTTPException(status_code=400, detail="Cannot add a household member to a residency that has already ended")

    return invite_account(
        db, member.email, member.full_name, [Role.RESIDENT],
        household_id=household.id, is_main_member=False,
    )


@router.put("/{household_id}/termination", response_model=list[ResidentResponse])
def set_household_termination(
    household_id: int,
    update: HouseholdTerminationUpdate,
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager),
):
    """Set, change or clear (null) the residency end date of a household and all its members. Requires the manager role."""
    household = get_household(db, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")

    conflict = check_household_date_conflict(
        db, household.address_of(), household.start_date, update.end_date, exclude_household_id=household.id,
    )
    if conflict:
        status_code = 400 if "cannot be before" in conflict else 409
        raise HTTPException(status_code=status_code, detail=conflict)

    household.end_date = update.end_date
    db.commit()

    refreshed = get_household(db, household_id)
    return [get_resident(db, member.id) for member in refreshed.members]
