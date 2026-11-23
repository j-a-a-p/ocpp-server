from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime, date
from typing import Optional, List
from models import Role, parse_roles

class ResidentFields(BaseModel):
    """What a manager enters about an account. A resident needs an address, a manager who is not a resident does not."""
    full_name: str = Field(min_length=1)
    roles: List[Role] = Field(min_length=1)
    street_name: Optional[str] = None
    house_number: Optional[str] = None
    house_number_suffix: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None

    @model_validator(mode="after")
    def residents_need_an_address(self):
        filled = all((value or "").strip() for value in (self.street_name, self.house_number, self.zip_code, self.city))
        if Role.RESIDENT in self.roles and not filled:
            raise ValueError("A resident needs a street name, a house number, a zip code and a city")
        return self

class ResidentCreate(ResidentFields):
    email: str

class ResidentUpdate(ResidentFields):
    pass

class HouseholdMemberCreate(BaseModel):
    full_name: str = Field(min_length=1)
    email: str

class ResidentResponse(BaseModel):
    id: int
    full_name: str
    email: str
    status: str
    roles: List[str] = []
    street_name: Optional[str] = None
    house_number: Optional[str] = None
    house_number_suffix: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    household_head_id: Optional[int] = None
    invite_expires_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    @field_validator("roles", mode="before")
    @classmethod
    def roles_from_the_stored_value(cls, value):
        return parse_roles(value) if isinstance(value, str) else value

    class Config:
        from_attributes = True

class AddressOption(BaseModel):
    street_name: str
    house_number: Optional[str] = None
    house_number_suffix: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None

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

class PowerLogPeriodSummary(BaseModel):
    total_records: int
    total_hours: float
    total_kwh: float
    max_power_kw: float
    avg_power_kw: float

class PowerLogMonthSummary(PowerLogPeriodSummary):
    year: int
    month: int  # 1 is January
    month_name: str

class PowerLogHourlyYear(BaseModel):
    year: int
    hourly_kwh: List[float]  # 24 values: the energy charged in each hour of the day (local time)

class PowerLogAnalyticsResponse(BaseModel):
    current_year_summary: PowerLogPeriodSummary
    monthly_data: List[PowerLogMonthSummary]  # the last twelve months, newest first
    hourly_by_year: List[PowerLogHourlyYear]  # the last three years with logs, oldest first

class StationPeriod(BaseModel):
    start: datetime  # UTC
    end: datetime  # UTC, "now" while the station is still online

class StationStatusResponse(BaseModel):
    station_id: str
    online: bool
    connected_since: Optional[datetime] = None  # only while online
    last_seen: datetime  # the last message of the station, or when it disconnected
    first_seen: datetime  # the first time the station connected
    uptime_percent: Optional[float] = None  # of the window, counted from the first connection when that is later
    connections: int  # how many times it came online in the window
    online_periods: List[StationPeriod]  # in time order, never overlapping, cut off at the window

class StationOverviewResponse(BaseModel):
    generated_at: datetime
    window_start: datetime
    window_hours: int
    online_count: int
    stations: List[StationStatusResponse]  # by station id

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
    kwh_price: float  # tariff "normaal"
    kwh_price_dal: Optional[float] = None  # tariff "dal": weekend and 21:00-07:00
    end_date: Optional[date] = None
    created: datetime

    class Config:
        from_attributes = True

class ActiveChargingCostResponse(ChargingCostResponse):
    current_tariff: str  # "normaal" or "dal", the one that applies right now
    current_kwh_price: float  # the price that applies right now

class ChargingCostCreate(BaseModel):
    kwh_price: float  # tariff "normaal"
    kwh_price_dal: Optional[float] = None  # tariff "dal"; the same as normaal when left out
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