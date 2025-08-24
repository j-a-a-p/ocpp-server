from pydantic import BaseModel, Field
from datetime import datetime, date
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
    name: str
    resident_id: int

class CardResponse(CardBase):
    class Config:
        from_attributes = True

class CardUpdate(BaseModel):
    name: str

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
    delta_power_cost: Optional[float] = None
    kwh_rate: Optional[float] = None

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
    card_name: Optional[str] = None

    class Config:
        from_attributes = True

class ChargingCostBase(BaseModel):
    kwh_price: float
    start_date: date

class ChargingCostResponse(BaseModel):
    id: int
    kwh_price: float
    end_date: Optional[date] = None
    created: datetime

    class Config:
        from_attributes = True

class ChargingCostCreate(BaseModel):
    kwh_price: float
    start_date: date

class ChargingProfileBase(BaseModel):
    name: str
    profile_type: str
    status: str
    max_current: Optional[float] = None

class ChargingProfileResponse(ChargingProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ChargingProfileCreate(BaseModel):
    name: str
    profile_type: str
    max_current: Optional[float] = None

class ChargingProfileUpdate(BaseModel):
    name: Optional[str] = None
    profile_type: Optional[str] = None
    status: Optional[str] = None
    max_current: Optional[float] = None