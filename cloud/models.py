from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import enum

class OwnerStatus(enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"

class Owner(Base):
    __tablename__ = "owners"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    reference = Column(String, unique=True, index=True)
    status = Column(Enum(OwnerStatus), default=OwnerStatus.INVITED)
    invite_token = Column(String, unique=True, nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)

class Invitation(Base):
    __tablename__ = "invitations"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    token = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class Card(Base):
    __tablename__ = "cards"

    rfid = Column(String, primary_key=True, index=True)  # Using RFID as primary key
    owner_id = Column(Integer, ForeignKey("owners.id"))

class FailedAuthentication(Base):
    __tablename__ = "failed_authentications"

    id = Column(Integer, primary_key=True, index=True)
    rfid = Column(String, nullable=False)  # Store the RFID, even if it doesn't exist in cards
    station_id = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)