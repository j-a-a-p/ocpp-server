"""The two tariffs: normaal (0.30) on weekdays from 07:00 to 21:00, dal (0.29) in the weekend and from 21:00 to 07:00.

The hours are Dutch time. Timestamps in the database are UTC, so in winter 20:00 UTC is 21:00 in the Netherlands
and in summer 19:00 UTC is.
"""
from datetime import datetime

import pytest

from crud import calculate_power_log_costs
from models import ChargingCost, PowerLog
from tariff import DAL, NORMAAL, tariff_at

# Winter time (UTC+1): Monday 2026-11-02 until Sunday 2026-11-08.
# Summer time (UTC+2): Monday 2026-06-01.


class TestWhichTariffApplies:
    @pytest.mark.parametrize(
        "utc, expected",
        [
            (datetime(2026, 11, 2, 6, 0), NORMAAL),   # Monday 07:00, dal ends
            (datetime(2026, 11, 2, 5, 59), DAL),      # Monday 06:59
            (datetime(2026, 11, 2, 12, 0), NORMAAL),  # Monday 13:00
            (datetime(2026, 11, 2, 19, 59), NORMAAL), # Monday 20:59
            (datetime(2026, 11, 2, 20, 0), DAL),      # Monday 21:00, dal starts
            (datetime(2026, 11, 2, 23, 0), DAL),      # Tuesday 00:00
            (datetime(2026, 11, 6, 12, 0), NORMAAL),  # Friday 13:00
            (datetime(2026, 11, 6, 20, 0), DAL),      # Friday 21:00, the weekend is on its way
            (datetime(2026, 11, 7, 12, 0), DAL),      # Saturday 13:00
            (datetime(2026, 11, 8, 12, 0), DAL),      # Sunday 13:00
            (datetime(2026, 11, 8, 19, 0), DAL),      # Sunday 20:00
            (datetime(2026, 11, 9, 5, 59), DAL),      # Monday 06:59, still the night after the weekend
            (datetime(2026, 11, 9, 6, 0), NORMAAL),   # Monday 07:00
        ],
    )
    def test_in_winter(self, utc, expected):
        assert tariff_at(utc) == expected

    @pytest.mark.parametrize(
        "utc, expected",
        [
            (datetime(2026, 6, 1, 4, 59), DAL),       # Monday 06:59
            (datetime(2026, 6, 1, 5, 0), NORMAAL),    # Monday 07:00
            (datetime(2026, 6, 1, 18, 59), NORMAAL),  # Monday 20:59
            (datetime(2026, 6, 1, 19, 0), DAL),       # Monday 21:00
        ],
    )
    def test_in_summer_the_hours_follow_the_clock_in_the_netherlands(self, utc, expected):
        assert tariff_at(utc) == expected

    def test_the_weekend_is_by_the_clock_in_the_netherlands_too(self):
        # Sunday 23:30 UTC is already Monday 00:30 in the Netherlands, which is dal because of the night.
        assert tariff_at(datetime(2026, 11, 8, 23, 30)) == DAL
        # Friday 23:30 UTC is already Saturday in the Netherlands.
        assert tariff_at(datetime(2026, 11, 6, 23, 30)) == DAL


class TestPriceOfAMoment:
    def test_normaal_and_dal_have_their_own_price(self):
        cost = ChargingCost(kwh_price=0.30, kwh_price_dal=0.29)

        assert float(cost.price_at(datetime(2026, 11, 2, 12, 0))) == 0.30
        assert float(cost.price_at(datetime(2026, 11, 7, 12, 0))) == 0.29

    def test_a_price_without_dal_is_the_same_all_day(self):
        cost = ChargingCost(kwh_price=0.30, kwh_price_dal=None)

        assert float(cost.price_at(datetime(2026, 11, 7, 12, 0))) == 0.30


class TestCostsOfCharges:
    def logs(self, start, *readings):
        return [
            PowerLog(id=index + 1, created=start.replace(minute=5 * index), power_kw=7.0, energy_kwh=energy)
            for index, energy in enumerate(readings)
        ]

    def test_a_charge_on_a_weekday_afternoon_costs_normaal(self, db):
        logs = calculate_power_log_costs(db, self.logs(datetime(2026, 11, 2, 12, 0), 10.0))

        assert (logs[0].kwh_rate, round(logs[0].delta_power_cost, 4)) == (0.30, 3.00)

    def test_a_charge_in_the_weekend_costs_dal(self, db):
        logs = calculate_power_log_costs(db, self.logs(datetime(2026, 11, 7, 12, 0), 10.0))

        assert (logs[0].kwh_rate, round(logs[0].delta_power_cost, 4)) == (0.29, 2.90)

    def test_a_charge_in_the_night_costs_dal(self, db):
        logs = calculate_power_log_costs(db, self.logs(datetime(2026, 11, 3, 1, 0), 10.0))

        assert (logs[0].kwh_rate, round(logs[0].delta_power_cost, 4)) == (0.29, 2.90)

    def test_a_charge_that_crosses_21_00_switches_price_at_that_moment(self, db):
        # 20:55 and 21:00 Dutch time: the energy of each step is priced at the time of the reading.
        logs = [
            PowerLog(id=1, created=datetime(2026, 11, 2, 19, 55), power_kw=7.0, energy_kwh=1.0),
            PowerLog(id=2, created=datetime(2026, 11, 2, 20, 0), power_kw=7.0, energy_kwh=2.0),
            PowerLog(id=3, created=datetime(2026, 11, 2, 20, 5), power_kw=7.0, energy_kwh=3.0),
        ]

        calculate_power_log_costs(db, logs)

        assert [log.kwh_rate for log in logs] == [0.30, 0.29, 0.29]
        assert [round(log.delta_power_cost, 4) for log in logs] == [0.30, 0.29, 0.29]

    def test_an_old_price_without_dal_stays_the_same_all_day(self, db):
        db.query(ChargingCost).delete()
        db.add(ChargingCost(kwh_price=0.20, kwh_price_dal=None, end_date=None, created=datetime(2026, 1, 1)))
        db.commit()

        weekend = calculate_power_log_costs(db, self.logs(datetime(2026, 11, 7, 12, 0), 1.0))

        assert weekend[0].kwh_rate == 0.20
