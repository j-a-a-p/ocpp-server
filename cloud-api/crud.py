from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_, or_
from models import (
    Household, Resident, ResidentStatus, Role, Card, RefusedCard,
    ChargingCost, ChargingProfile, ProfileType, ProfileStatus,
)
from schemas import CardBase, ChargingCostBase, ChargingProfileCreate, ChargingProfileUpdate
from tariff import tariff_at, to_local
from datetime import datetime, date
from typing import List, Optional

# An address: (street name, house number, house number suffix, zip code, city). The suffix is optional.
Address = tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]
EMPTY_ADDRESS: Address = (None, None, None, None, None)


def _resident_query(db: Session):
    return db.query(Resident).options(selectinload(Resident.household).selectinload(Household.members))


def get_residents(db: Session, skip: int = 0, limit: int = 100):
    return _resident_query(db).offset(skip).limit(limit).all()

def get_resident(db: Session, resident_id: int):
    return _resident_query(db).filter(Resident.id == resident_id).first()

def get_resident_by_email(db: Session, email: str):
    return _resident_query(db).filter(Resident.email == email).first()

def get_household(db: Session, household_id: int) -> Optional[Household]:
    return (
        db.query(Household)
        .options(selectinload(Household.members))
        .filter(Household.id == household_id)
        .first()
    )

def create_invited_resident(
    db: Session,
    full_name: str,
    email: str,
    roles,
    invite_token: str,
    expires_at: datetime,
    address: Optional[Address] = None,
    household_id: Optional[int] = None,
    is_main_member: bool = False,
    start_date: Optional[date] = None,
):
    if household_id is None and address is not None:
        household = Household(start_date=start_date, end_date=None)
        household.set_address(address)
        db.add(household)
        db.flush()
        household_id = household.id
        is_main_member = True

    db_resident = Resident(
        full_name=full_name,
        email=email,
        status=ResidentStatus.INVITED,
        invite_token=invite_token,
        invite_expires_at=expires_at,
        household_id=household_id,
        is_main_member=is_main_member,
    )
    db_resident.set_roles(roles)
    db.add(db_resident)
    db.commit()
    return get_resident(db, db_resident.id)


def _clean_address_value(value: Optional[str]) -> Optional[str]:
    """Trimmed, with single spaces. Empty becomes None."""
    return " ".join((value or "").split()) or None


def _stored_spelling(db: Session, column, value: Optional[str]) -> Optional[str]:
    """The spelling that is already in the database for this value, ignoring case. Otherwise the value itself."""
    value = _clean_address_value(value)
    if value is None:
        return None
    for (stored,) in db.query(column).filter(column.isnot(None)).distinct():
        if stored.casefold() == value.casefold():
            return stored
    return value


def normalize_address(
    db: Session,
    street_name: Optional[str],
    house_number: Optional[str],
    house_number_suffix: Optional[str],
    zip_code: Optional[str],
    city: Optional[str],
) -> Address:
    """Clean an address entered by hand and reuse the spelling that is already used, so that 'hoofdstraat' and
    'Hoofdstraat' do not become two different streets."""
    return (
        _stored_spelling(db, Household.street_name, street_name),
        _stored_spelling(db, Household.house_number, house_number),
        _stored_spelling(db, Household.house_number_suffix, house_number_suffix),
        _stored_spelling(db, Household.zip_code, zip_code),
        _stored_spelling(db, Household.city, city),
    )


def address_match_key(address: Address) -> Optional[tuple[str, str, str]]:
    """Canonical identity of an address: street, house number, and optional suffix (case-insensitive)."""
    street, number, suffix, _, _ = address
    if not street:
        return None
    return (
        street.strip().casefold(),
        (number or "").strip().casefold(),
        (suffix or "").strip().casefold(),
    )


def find_households_at_address(
    db: Session,
    address: Address,
    exclude_household_id: Optional[int] = None,
) -> list[Household]:
    """All households living (or having lived) at the same street + house number + suffix."""
    key = address_match_key(address)
    if key is None:
        return []
    query = db.query(Household).filter(Household.street_name.isnot(None))
    if exclude_household_id is not None:
        query = query.filter(Household.id != exclude_household_id)
    return [h for h in query.all() if address_match_key(h.address_of()) == key]


def check_household_date_conflict(
    db: Session,
    address: Address,
    start_date: Optional[date],
    end_date: Optional[date],
    exclude_household_id: Optional[int] = None,
) -> Optional[str]:
    """Return a human-readable conflict message if [start_date, end_date] overlaps another household at the address."""
    if start_date is not None and end_date is not None and end_date < start_date:
        return "End date cannot be before start date"

    others = find_households_at_address(db, address, exclude_household_id=exclude_household_id)
    for other in others:
        s1, e1 = other.start_date, other.end_date
        s2, e2 = start_date, end_date
        overlaps = (e1 is None or s2 is None or s2 <= e1) and (e2 is None or s1 is None or s1 <= e2)
        if not overlaps:
            continue
        if e1 is None and e2 is None:
            return "This address already has an active resident. Terminate the current residency first."
        if e1 is not None and s2 is not None and s2 <= e1 and (e2 is None or s1 is None or s1 <= e2):
            return f"Start date must be after the previous residency's end date ({e1.isoformat()})."
        if e2 is None and s1 is not None:
            return f"Cannot clear end date because another residency starts on {s1.isoformat()} at this address."
        if e2 is not None and s1 is not None and e2 >= s1:
            return f"End date must be before the next residency's start date ({s1.isoformat()})."
        return "Residency dates overlap with another household at this address."
    return None


def get_address_options(db: Session):
    """The distinct addresses that are in use, for the drop downs of the invite form."""
    return (
        db.query(
            Household.street_name, Household.house_number, Household.house_number_suffix,
            Household.zip_code, Household.city,
        )
        .filter(Household.street_name.isnot(None))
        .distinct()
        .order_by(
            Household.street_name, Household.house_number, Household.house_number_suffix,
            Household.zip_code, Household.city,
        )
        .all()
    )


def count_other_active_managers(db: Session, resident_id: int) -> int:
    return (
        db.query(Resident)
        .filter(Resident.id != resident_id, Resident.status == ResidentStatus.ACTIVE, Resident.has_role_sql(Role.MANAGER))
        .count()
    )


def get_household_members(db: Session, resident: Resident):
    """The household members of a main member (everybody else in their household)."""
    if not resident.household_id or not resident.is_main_member:
        return []
    return (
        _resident_query(db)
        .filter(Resident.household_id == resident.household_id, Resident.id != resident.id)
        .order_by(Resident.full_name)
        .all()
    )

def update_resident(db: Session, resident_id: int, updates: dict):
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        return None
        
    for key, value in updates.items():
        setattr(resident, key, value)
    
    db.commit()
    return get_resident(db, resident_id)

def get_cards(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Card).offset(skip).limit(limit).all()

def create_card(db: Session, card: CardBase):
    db_card = Card(rfid=card.rfid, name=card.name, resident_id=card.resident_id)
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def log_refused_card(db: Session, rfid: str, station_id: str):
    refused_card = RefusedCard(rfid=rfid, station_id=station_id)
    db.add(refused_card)
    db.commit()

def update_card_name(db: Session, rfid: str, name: str):
    card = db.query(Card).filter(Card.rfid == rfid).first()
    if not card:
        return None
    
    card.name = name
    db.commit()
    db.refresh(card)
    return card

def get_charging_costs(db: Session, skip: int = 0, limit: int = 100) -> List[ChargingCost]:
    """Get all charging costs ordered by creation date (newest first)"""
    return db.query(ChargingCost).order_by(ChargingCost.created.desc()).offset(skip).limit(limit).all()

def get_active_charging_cost(db: Session) -> ChargingCost:
    """Get the currently active charging cost"""
    return ChargingCost.get_active_cost(db)

def create_charging_cost(db: Session, kwh_price: float, start_date: date, kwh_price_dal: Optional[float] = None) -> ChargingCost:
    """Create a new charging cost and deactivate the current one.

    kwh_price is the "normaal" price. Without a "dal" price, dal costs the same as normaal."""
    # Check if there's an active cost to deactivate
    active_cost = ChargingCost.get_active_cost(db)
    
    if active_cost:
        # Calculate end_date for current active cost (start_date - 1 day)
        end_date_for_current = start_date - date.resolution
        
        # Deactivate current active cost
        ChargingCost.deactivate_current_cost(db, end_date_for_current)
    
    # Create new charging cost
    new_cost = ChargingCost(
        kwh_price=kwh_price,
        kwh_price_dal=kwh_price_dal if kwh_price_dal is not None else kwh_price,
        end_date=None  # This will be the new active cost
    )
    db.add(new_cost)
    db.commit()
    db.refresh(new_cost)
    return new_cost

def get_charging_cost_by_id(db: Session, cost_id: int) -> ChargingCost:
    """Get a specific charging cost by ID"""
    return db.query(ChargingCost).filter(ChargingCost.id == cost_id).first()

def get_active_charging_cost_at_date(db: Session, target_date: datetime) -> ChargingCost:
    """Get the active charging cost at a specific date"""
    from models import ChargingCost
    target_date_only = target_date.date()
    
    # Find the charging cost that was active at the target date
    # This means either it has no end_date (still active) or its end_date is after the target date
    return db.query(ChargingCost).filter(
        (ChargingCost.end_date.is_(None)) | (ChargingCost.end_date > target_date_only)
    ).order_by(ChargingCost.created.desc()).first()

class ChargingCostLookup:
    """The charging cost that applies on a (local) day, with the same rule as get_active_charging_cost_at_date.

    The price list is read once, so pricing many power logs costs no query per day."""

    def __init__(self, db: Session):
        self._costs = db.query(ChargingCost).order_by(ChargingCost.created.desc()).all()
        self._by_day = {}

    def on(self, day: date) -> Optional[ChargingCost]:
        if day not in self._by_day:
            self._by_day[day] = next((cost for cost in self._costs if cost.end_date is None or cost.end_date > day), None)
        return self._by_day[day]


def _priced_steps(power_logs, prices: ChargingCostLookup):
    """(log, kWh rate, cost of the energy since the previous log) for each log, in time order.

    A log only needs .created and .energy_kwh, so plain query rows work too."""
    import logging

    logger = logging.getLogger(__name__)
    previous = None
    for log in sorted(power_logs, key=lambda x: x.created):
        local = to_local(log.created)
        cost = prices.on(local.date())
        # Which of the two prices applies depends on the time of day, so it is chosen per power log.
        kwh_rate = float(cost.price_for_tariff(tariff_at(local))) if cost else 0.0

        # The first log counts in full, the others only the increase since the previous one.
        delta_energy = log.energy_kwh if previous is None else log.energy_kwh - previous
        if delta_energy < 0:
            # The charger's counter drops now and then (see migration V11); such a step costs nothing.
            logger.debug(f"Negative energy increase in power log {getattr(log, 'id', None)}: delta_energy={delta_energy:.4f} kWh, current_energy={log.energy_kwh:.4f} kWh, previous_energy={previous:.4f} kWh")
            delta_cost = 0.0
        else:
            delta_cost = float(delta_energy * kwh_rate) if delta_energy and kwh_rate else 0.0
        previous = log.energy_kwh
        yield log, kwh_rate, delta_cost


def calculate_power_log_costs(db: Session, power_logs: list, prices: Optional[ChargingCostLookup] = None) -> list:
    """Sets kwh_rate and delta_power_cost on each power log, from the charging cost active at the time."""
    if not power_logs:
        return power_logs
    for log, kwh_rate, delta_cost in _priced_steps(power_logs, prices or ChargingCostLookup(db)):
        log.kwh_rate = kwh_rate
        log.delta_power_cost = delta_cost
    return power_logs


def total_power_log_cost(power_logs, prices: ChargingCostLookup) -> float:
    """What the energy of a charge costs: the sum of the delta_power_cost of its logs."""
    return sum(delta_cost for _, _, delta_cost in _priced_steps(power_logs, prices))

# Charging Profile CRUD operations
def create_charging_profile(db: Session, profile: ChargingProfileCreate) -> ChargingProfile:
    db_profile = ChargingProfile(
        name=profile.name,
        profile_type=ProfileType(profile.profile_type),
        max_current=profile.max_current
    )
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

def get_charging_profiles(db: Session, skip: int = 0, limit: int = 100) -> List[ChargingProfile]:
    return db.query(ChargingProfile).offset(skip).limit(limit).all()

def get_charging_profile(db: Session, profile_id: int) -> Optional[ChargingProfile]:
    return db.query(ChargingProfile).filter(ChargingProfile.id == profile_id).first()

def update_charging_profile(db: Session, profile_id: int, profile: ChargingProfileUpdate) -> Optional[ChargingProfile]:
    db_profile = get_charging_profile(db, profile_id)
    if not db_profile:
        return None
    
    update_data = profile.dict(exclude_unset=True)
    
    # Convert string values to enums if provided
    if "profile_type" in update_data:
        update_data["profile_type"] = ProfileType(update_data["profile_type"])
    if "status" in update_data:
        update_data["status"] = ProfileStatus(update_data["status"])
    
    for field, value in update_data.items():
        setattr(db_profile, field, value)
    
    db_profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_profile)
    return db_profile

def inactivate_charging_profile(db: Session, profile_id: int) -> Optional[ChargingProfile]:
    db_profile = get_charging_profile(db, profile_id)
    if not db_profile:
        return None
    
    db_profile.status = ProfileStatus.INACTIVE
    db_profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_profile)
    return db_profile

def reactivate_charging_profile(db: Session, profile_id: int) -> Optional[ChargingProfile]:
    db_profile = get_charging_profile(db, profile_id)
    if not db_profile:
        return None
    
    db_profile.status = ProfileStatus.DRAFT
    db_profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_profile)
    return db_profile