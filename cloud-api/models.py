from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Enum, Float, Date, Numeric, literal
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from tariff import DAL, local_today, tariff_at
from datetime import datetime, date
import enum

class ResidentStatus(enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"

class Role(str, enum.Enum):
    """What an account may do. An account has one or more roles, stored as a comma separated list.

    MANAGER:  use the management portal and invite people.
    RESIDENT: has an address, can charge and can invite household members.
    """
    MANAGER = "manager"
    RESIDENT = "resident"


def parse_roles(value: str | None) -> list[str]:
    """The role names in a stored roles value, e.g. 'manager,resident' -> ['manager', 'resident']."""
    return [name for name in (value or "").split(",") if name]


def format_roles(roles) -> str:
    """The value to store for some roles: validated, without duplicates, sorted, no spaces."""
    return ",".join(sorted({Role(role).value for role in roles}))


class ProfileType(enum.Enum):
    MAX_CURRENT = "max_current"

class ProfileStatus(enum.Enum):
    DRAFT = "Draft"
    ACTIVE = "Active"
    INACTIVE = "Inactive"

class ChargingProfile(Base):
    __tablename__ = "charging_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    profile_type = Column(Enum(ProfileType), nullable=False)
    status = Column(Enum(ProfileStatus), default=ProfileStatus.DRAFT)
    max_current = Column(Float, nullable=True)  # For max_current profile type
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Household(Base):
    """One tenancy at an address, with a start date, optional end date, and one main member.

    The main member is the first resident of the household, receives invoices and updates, and can invite
    household members. Setting end_date ends the residency for the entire household.
    """
    __tablename__ = "households"

    id = Column(Integer, primary_key=True, index=True)
    street_name = Column(String, nullable=True)
    house_number = Column(String, nullable=True)
    house_number_suffix = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    city = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    members = relationship("Resident", back_populates="household")

    def set_address(self, address) -> None:
        """address is (street name, house number, suffix, zip code, city)."""
        self.street_name, self.house_number, self.house_number_suffix, self.zip_code, self.city = address

    def address_of(self):
        return (self.street_name, self.house_number, self.house_number_suffix, self.zip_code, self.city)

    def has_address(self) -> bool:
        return bool(self.street_name and self.house_number and self.zip_code and self.city)

    def state_on(self, day: date) -> str:
        """'upcoming' before start_date, 'ended' after end_date, otherwise 'active'."""
        if self.end_date is not None and day > self.end_date:
            return "ended"
        if self.start_date is not None and day < self.start_date:
            return "upcoming"
        return "active"

    def can_charge_on(self, day: date) -> bool:
        return self.state_on(day) == "active"

    @property
    def main_member(self):
        return next((member for member in self.members if member.is_main_member), None)


class Resident(Base):
    __tablename__ = "residents"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    status = Column(Enum(ResidentStatus), default=ResidentStatus.INVITED)
    invite_token = Column(String, unique=True, nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    login_token = Column(String, unique=True, nullable=True)
    login_expires_at = Column(DateTime, nullable=True)
    # Comma separated role names, see Role. Use has_role / set_roles, and has_role_sql in queries.
    roles = Column(String, nullable=False, default="", server_default="")
    household_id = Column(Integer, ForeignKey("households.id"), nullable=True)
    # True for the first resident of a household: receives invoices and updates, can invite household members.
    is_main_member = Column(Boolean, nullable=False, default=False, server_default="0")

    household = relationship("Household", back_populates="members")
    cards = relationship("Card", back_populates="resident")

    @property
    def role_names(self) -> list[str]:
        return parse_roles(self.roles)

    def has_role(self, role: Role) -> bool:
        return role.value in self.role_names

    def set_roles(self, roles) -> None:
        self.roles = format_roles(roles)

    @property
    def street_name(self):
        return self.household.street_name if self.household else None

    @property
    def house_number(self):
        return self.household.house_number if self.household else None

    @property
    def house_number_suffix(self):
        return self.household.house_number_suffix if self.household else None

    @property
    def zip_code(self):
        return self.household.zip_code if self.household else None

    @property
    def city(self):
        return self.household.city if self.household else None

    @property
    def residency_start_date(self) -> date | None:
        return self.household.start_date if self.household else None

    @property
    def residency_end_date(self) -> date | None:
        return self.household.end_date if self.household else None

    def residency_state_on(self, day: date) -> str | None:
        if not self.household:
            return None
        return self.household.state_on(day)

    @property
    def residency_state(self) -> str | None:
        return self.residency_state_on(local_today())

    def can_charge_on(self, day: date) -> bool:
        return (
            self.status == ResidentStatus.ACTIVE
            and self.has_role(Role.RESIDENT)
            and self.household is not None
            and self.household.can_charge_on(day)
        )

    def address_of(self):
        if not self.household:
            return (None, None, None, None, None)
        return self.household.address_of()

    @property
    def is_household_member(self) -> bool:
        return self.household_id is not None and not self.is_main_member

    @property
    def household_head_id(self) -> int | None:
        if not self.is_household_member or not self.household:
            return None
        main = self.household.main_member
        return main.id if main else None

    @classmethod
    def has_role_sql(cls, role: Role):
        """SQL condition: the account has this role. Matches whole role names, not parts of them."""
        return (literal(",") + cls.roles + literal(",")).like(f"%,{role.value},%")

class Card(Base):
    __tablename__ = "cards"

    #TODO at some point you want to add a tenant id to this key
    rfid = Column(String, primary_key=True, index=True)  # Using RFID as primary key
    name = Column(String, nullable=False)  # Card name for display
    resident_id = Column(Integer, ForeignKey("residents.id", ondelete="RESTRICT"))
    # A manager can switch a card off: it stays registered but cannot start a charge.
    enabled = Column(Boolean, nullable=False, default=True, server_default="1")
    
    resident = relationship("Resident", back_populates="cards")
    charge_transactions = relationship("ChargeTransaction", back_populates="card")

class ChargeTransaction(Base):
    __tablename__ = "charge_transactions"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(String, nullable=False)
    rfid = Column(String, ForeignKey("cards.rfid"), nullable=False)
    created = Column(DateTime(timezone=True), server_default=func.now())
    final_energy_kwh = Column(Float, nullable=True)

    card = relationship("Card", back_populates="charge_transactions")
    power_logs = relationship("PowerLog", back_populates="charge_transaction")

class PowerLog(Base):
    __tablename__ = "power_logs"

    id = Column(Integer, primary_key=True, index=True)
    charge_transaction_id = Column(Integer, ForeignKey("charge_transactions.id"), nullable=False)
    created = Column(DateTime(timezone=True), server_default=func.now())
    power_kw = Column(Float, nullable=False)
    energy_kwh = Column(Float, nullable=False)

    charge_transaction = relationship("ChargeTransaction", back_populates="power_logs")

class RefusedCard(Base):
    __tablename__ = "refused_cards"

    id = Column(Integer, primary_key=True, index=True)
    rfid = Column(String, nullable=False)
    station_id = Column(String, nullable=False)
    created = Column(DateTime(timezone=True), server_default=func.now())

class StationConnection(Base):
    """One WebSocket connection of a charging station. Written by the station controller, times are UTC.

    A row without disconnected_at is open: the station is connected now, or it was when the station
    controller stopped. last_seen_at is the last message of the station (the heartbeat), so it tells
    the two apart.
    """
    __tablename__ = "station_connections"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(String, nullable=False)
    connected_at = Column(DateTime, nullable=False, server_default=func.now())
    last_seen_at = Column(DateTime, nullable=False, server_default=func.now())
    disconnected_at = Column(DateTime, nullable=True)

class ChargingCost(Base):
    __tablename__ = "charging_costs"

    id = Column(Integer, primary_key=True, index=True)
    kwh_price = Column(Numeric(10, 4), nullable=False)  # tariff "normaal"
    kwh_price_dal = Column(Numeric(10, 4), nullable=True)  # tariff "dal"; empty means the same as normaal
    end_date = Column(Date, nullable=True)
    created = Column(DateTime(timezone=True), server_default=func.now())

    def price_for_tariff(self, tariff):
        if tariff == DAL and self.kwh_price_dal is not None:
            return self.kwh_price_dal
        return self.kwh_price

    def price_at(self, moment):
        """The price per kWh at a moment in time (a datetime; without timezone means UTC)."""
        return self.price_for_tariff(tariff_at(moment))

    @classmethod
    def get_active_cost(cls, db_session):
        """Get the currently active charging cost (no end_date or future end_date)"""
        today = date.today()
        return db_session.query(cls).filter(
            (cls.end_date.is_(None)) | (cls.end_date > today)
        ).first()

    @classmethod
    def deactivate_current_cost(cls, db_session, end_date):
        """Deactivate the current active cost by setting its end_date"""
        active_cost = cls.get_active_cost(db_session)
        if active_cost:
            active_cost.end_date = end_date
            db_session.commit()
            return active_cost
        return None