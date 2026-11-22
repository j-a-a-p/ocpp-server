"""The power log analytics of the management portal.

energy_kwh of a power log is the running meter total of its charge, so a log contributes the increase
since the previous log of the same charge, and a meter that goes backwards contributes nothing.
Years, months and hours of the day are Dutch local time, like the tariffs.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from tariff import LOCAL_TIMEZONE, to_local

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# The energy per hour of the day is shown for the current year and the years before it.
HOURLY_YEARS = 3

# The window function sees all logs of a charge, also the ones before :since, so the first log
# inside the period still gets the increase since the log before it.
LOGS_SINCE = text("""
    SELECT charge_transaction_id, created, power_kw, delta_kwh
    FROM (
        SELECT charge_transaction_id, created, power_kw,
               MAX(0, energy_kwh - COALESCE(
                   LAG(energy_kwh) OVER (PARTITION BY charge_transaction_id ORDER BY created, id), 0
               )) AS delta_kwh
        FROM power_logs
        WHERE charge_transaction_id IN (SELECT charge_transaction_id FROM power_logs WHERE created >= :since)
    )
    WHERE created >= :since
""")


class _Period:
    def __init__(self):
        self.records = 0
        self.kwh = 0.0
        self.max_power_kw = 0.0
        self.power_sum = 0.0
        # The first and the last log of each charge in this period.
        self.spans = {}

    def add(self, transaction_id: int, moment: datetime, power_kw: float, delta_kwh: float) -> None:
        self.records += 1
        self.kwh += delta_kwh
        self.max_power_kw = max(self.max_power_kw, power_kw)
        self.power_sum += power_kw
        span = self.spans.get(transaction_id)
        if span is None:
            self.spans[transaction_id] = [moment, moment]
        else:
            span[0] = min(span[0], moment)
            span[1] = max(span[1], moment)

    def summary(self) -> dict:
        seconds = sum((last - first).total_seconds() for first, last in self.spans.values())
        return {
            "total_records": self.records,
            "total_hours": seconds / 3600,
            "total_kwh": self.kwh,
            "max_power_kw": self.max_power_kw,
            "avg_power_kw": self.power_sum / self.records if self.records else 0.0,
        }


def _utc_text(moment: datetime) -> str:
    """The format of the created column: UTC, without a timezone."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def calculate_analytics(db: Session, now: Optional[datetime] = None) -> dict:
    now = to_local(now) if now else datetime.now(LOCAL_TIMEZONE)
    first_hourly_year = now.year - HOURLY_YEARS + 1
    since = datetime(first_hourly_year, 1, 1, tzinfo=LOCAL_TIMEZONE)
    # The first day of the month eleven months ago: twelve calendar months including this one.
    months_back = now.year * 12 + now.month - 1 - 11
    twelve_months_ago = datetime(months_back // 12, months_back % 12 + 1, 1, tzinfo=LOCAL_TIMEZONE)

    current_year = _Period()
    months = {}
    hourly = {}
    for transaction_id, created, power_kw, delta_kwh in db.execute(LOGS_SINCE, {"since": _utc_text(since)}):
        moment = datetime.fromisoformat(created)
        local = to_local(moment)
        if local.year == now.year:
            current_year.add(transaction_id, moment, power_kw, delta_kwh)
        if local >= twelve_months_ago:
            months.setdefault((local.year, local.month), _Period()).add(transaction_id, moment, power_kw, delta_kwh)
        hourly.setdefault(local.year, [0.0] * 24)[local.hour] += delta_kwh

    return {
        "current_year_summary": current_year.summary(),
        "monthly_data": [
            {"year": year, "month": month, "month_name": MONTH_NAMES[month - 1], **months[(year, month)].summary()}
            for year, month in sorted(months, reverse=True)
        ],
        "hourly_by_year": [{"year": year, "hourly_kwh": hourly[year]} for year in sorted(hourly)],
    }
