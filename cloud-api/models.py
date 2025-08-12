from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Float
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