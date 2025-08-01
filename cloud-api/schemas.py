from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ResidentBase(BaseModel):
    full_name: str
    email: str

class ResidentResponse(ResidentBase):
    id: int
    status: str
    invite_expires_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CardBase(BaseModel):
    rfid: str
    resident_id: int

class CardResponse(CardBase):
    class Config:
        from_attributes = True

class RefusedCardBase(BaseModel):
    rfid: str
    station_id: str

class RefusedCardResponse(RefusedCardBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class PowerLogBase(BaseModel):
    power_kw: float
    energy_kwh: float

class PowerLogResponse(PowerLogBase):
    id: int
    charge_transaction_id: int
    created: datetime

    class Config:
        from_attributes = True

class ChargeTransactionBase(BaseModel):
    station_id: str
    rfid: str

class ChargeTransactionResponse(ChargeTransactionBase):
    id: int
    created: datetime
    final_energy_kwh: Optional[float] = None
    power_logs: List[PowerLogResponse] = []

    class Config:
        from_attributes = True