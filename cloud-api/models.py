from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Float, Date, Numeric, literal
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from tariff import DAL, tariff_at
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
    street_name = Column(String, nullable=True)
    house_number = Column(String, nullable=True)
    house_number_suffix = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    city = Column(String, nullable=True)
    # Set for a household member: the resident who invited them. They live at the address of that resident.
    household_head_id = Column(Integer, ForeignKey("residents.id"), nullable=True)

    cards = relationship("Card", back_populates="resident")

    @property
    def role_names(self) -> list[str]:
        return parse_roles(self.roles)

    def has_role(self, role: Role) -> bool:
        return role.value in self.role_names

    def set_roles(self, roles) -> None:
        self.roles = format_roles(roles)

    def set_address(self, address) -> None:
        """address is (street name, house number, suffix, zip code, city)."""
        self.street_name, self.house_number, self.house_number_suffix, self.zip_code, self.city = address

    def address_of(self):
        return (self.street_name, self.house_number, self.house_number_suffix, self.zip_code, self.city)

    @property
    def is_household_member(self) -> bool:
        return self.household_head_id is not None

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