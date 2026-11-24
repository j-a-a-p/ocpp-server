from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Enum, Float, literal
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from datetime import datetime
import enum

class ResidentStatus(enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"

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
    # Comma separated role names, written by the cloud API. Only accounts with the "resident" role may charge.
    roles = Column(String, nullable=False, default="", server_default="")

    cards = relationship("Card", back_populates="resident")

    @classmethod
    def has_role_sql(cls, role: str):
        """SQL condition: the account has this role. Matches whole role names, not parts of them."""
        return (literal(",") + cls.roles + literal(",")).like(f"%,{role},%")

class Card(Base):
    __tablename__ = "cards"

    #TODO at some point you want to add a tenant id to this key
    rfid = Column(String, primary_key=True, index=True)  # Using RFID as primary key
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
    """One WebSocket connection of a charging station, for the stations page of the management portal."""
    __tablename__ = "station_connections"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(String, nullable=False)
    connected_at = Column(DateTime, nullable=False, server_default=func.now())
    last_seen_at = Column(DateTime, nullable=False, server_default=func.now())
    disconnected_at = Column(DateTime, nullable=True)