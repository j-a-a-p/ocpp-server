from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from database import Base

class ChargeTransaction(Base):
    __tablename__ = "charge_transactions"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(String, nullable=False)
    rfid = Column(String, index=True, nullable=False)
    created = Column(DateTime(timezone=True), server_default=func.now()) 