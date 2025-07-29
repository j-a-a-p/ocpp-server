from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
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
    reference = Column(String, unique=True, index=True)
    status = Column(Enum(ResidentStatus), default=ResidentStatus.INVITED)
    invite_token = Column(String, unique=True, nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    
    cards = relationship("Card", back_populates="resident")

class Card(Base):
    __tablename__ = "cards"

    #TODO at some point you want to add a tenant id to this key
    rfid = Column(String, primary_key=True, index=True)  # Using RFID as primary key
    resident_id = Column(Integer, ForeignKey("residents.id", ondelete="RESTRICT"))
    
    resident = relationship("Resident", back_populates="cards")
    charge_transactions = relationship("ChargeTransaction", back_populates="card")

class ChargeTransaction(Base):
    __tablename__ = "charge_transactions"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(String, nullable=False)
    rfid = Column(String, ForeignKey("cards.rfid"), nullable=False)
    created = Column(DateTime(timezone=True), server_default=func.now())

    card = relationship("Card", back_populates="charge_transactions")

class FailedAuthentication(Base):
    __tablename__ = "failed_authentications"

    id = Column(Integer, primary_key=True, index=True)
    rfid = Column(String, nullable=False)
    station_id = Column(String, nullable=False)
    created = Column(DateTime, default=datetime.utcnow)