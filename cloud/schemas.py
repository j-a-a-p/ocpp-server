from pydantic import BaseModel
from datetime import datetime

class OwnerBase(BaseModel):
    full_name: str
    email: str
    reference: str

class OwnerResponse(OwnerBase):
    id: int

    class Config:
        from_attributes = True

class CardBase(BaseModel):
    rfid: str
    owner_id: int

class CardResponse(CardBase):
    class Config:
        from_attributes = True

class FailedAuthenticationBase(BaseModel):
    rfid: str
    station_id: str

class FailedAuthenticationResponse(FailedAuthenticationBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True