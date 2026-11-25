"""The two kWh tariffs: "normaal" and "dal".

Dal (off-peak) is the whole weekend and every day between 21:00 and 07:00. Everything else is normaal.
The hours are local time, so the rule follows the clock in the Netherlands, also across daylight saving time.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

LOCAL_TIMEZONE = ZoneInfo("Europe/Amsterdam")

NORMAAL = "normaal"
DAL = "dal"

DAL_STARTS_AT_HOUR = 21
DAL_ENDS_AT_HOUR = 7
SATURDAY = 5


def to_local(moment: datetime) -> datetime:
    """A moment in local time. Timestamps from the database have no timezone and are UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(LOCAL_TIMEZONE)


def local_today() -> date:
    """Today's date in the Netherlands, used for residency start/end date checks."""
    return datetime.now(LOCAL_TIMEZONE).date()


def tariff_at(moment: datetime) -> str:
    local = to_local(moment)
    if local.weekday() >= SATURDAY or local.hour >= DAL_STARTS_AT_HOUR or local.hour < DAL_ENDS_AT_HOUR:
        return DAL
    return NORMAAL
