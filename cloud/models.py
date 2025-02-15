from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Owner(Base):
    __tablename__ = "owners"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    reference_id = Column(Integer, ForeignKey("owner_references.id"))

class OwnerReference(Base):
    __tablename__ = "owner_references"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True, index=True)

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