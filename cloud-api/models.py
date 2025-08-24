from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Float, Date, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from datetime import datetime, date
import enum

class ResidentStatus(enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"

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
    
    cards = relationship("Card", back_populates="resident")

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

class ChargingCost(Base):
    __tablename__ = "charging_costs"

    id = Column(Integer, primary_key=True, index=True)
    kwh_price = Column(Numeric(10, 4), nullable=False)
    end_date = Column(Date, nullable=True)
    created = Column(DateTime(timezone=True), server_default=func.now())

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