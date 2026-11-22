"""The power log analytics of the management portal (GET /power-logs/analytics)."""
from datetime import datetime, timezone

import pytest

from power_log_analytics import calculate_analytics
from tariff import LOCAL_TIMEZONE

NOW = datetime(2026, 11, 22, 12, 0, tzinfo=LOCAL_TIMEZONE)


def local(month, day, hour, minute=0, year=2026) -> datetime:
    """A moment on the Dutch clock, as the database stores it: UTC without a timezone."""
    return datetime(year, month, day, hour, minute, tzinfo=LOCAL_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def charge(me, make_card, make_transaction):
    """A charge that starts at `started`; logs are (minutes after the start, kW, kWh on the meter)."""
    card = make_card(me)
    return lambda started, *logs: make_transaction(card, logs, started=started)


@pytest.fixture
def analytics(db):
    return lambda: calculate_analytics(db, now=NOW)


class TestEnergy:
    def test_adds_the_increases_of_the_meter_not_the_running_totals(self, charge, analytics):
        # One charge of 6 kWh in four logs. Adding the totals would give 1 + 3 + 5 + 6 = 15 kWh.
        charge(local(11, 20, 10), (0, 7, 1), (5, 8, 3), (10, 9, 5), (15, 6, 6))

        summary = analytics()["current_year_summary"]

        assert summary["total_kwh"] == 6
        assert summary["total_records"] == 4
        assert summary["max_power_kw"] == 9
        assert summary["avg_power_kw"] == 7.5
        assert summary["total_hours"] == pytest.approx(0.25)

    def test_keeps_charges_apart(self, charge, analytics):
        charge(local(11, 20, 10), (0, 7, 4), (5, 7, 6))
        charge(local(11, 20, 10, 1), (0, 7, 3), (5, 7, 4))

        assert analytics()["current_year_summary"]["total_kwh"] == 10

    def test_a_meter_that_goes_backwards_adds_nothing(self, charge, analytics):
        charge(local(11, 20, 10), (0, 7, 5), (5, 7, 4))

        assert analytics()["current_year_summary"]["total_kwh"] == 5

    def test_adds_up_the_hours_of_every_charge_separately(self, charge, analytics):
        charge(local(11, 20, 10), (0, 7, 1), (60, 7, 2))
        charge(local(11, 21, 10), (0, 7, 1), (30, 7, 2))

        assert analytics()["current_year_summary"]["total_hours"] == pytest.approx(1.5)

    def test_a_charge_with_one_log_has_no_hours(self, charge, analytics):
        charge(local(11, 20, 10), (0, 7, 1))

        assert analytics()["current_year_summary"]["total_hours"] == 0

    def test_all_zeros_without_logs(self, analytics):
        assert analytics() == {
            "current_year_summary": {"total_records": 0, "total_hours": 0, "total_kwh": 0, "max_power_kw": 0, "avg_power_kw": 0},
            "monthly_data": [],
            "hourly_by_year": [],
        }


class TestPeriods:
    def test_the_current_year_leaves_other_years_out(self, charge, analytics):
        charge(local(6, 1, 10, year=2025), (0, 7, 4))
        charge(local(11, 20, 10), (0, 7, 2))

        assert analytics()["current_year_summary"]["total_kwh"] == 2

    def test_the_year_follows_the_dutch_clock(self, charge, analytics):
        # 00:30 on New Year's Day in the Netherlands is still 2025 in UTC.
        charge(local(1, 1, 0, 30), (0, 7, 2))

        assert analytics()["current_year_summary"]["total_kwh"] == 2

    def test_groups_the_last_twelve_months_newest_first(self, charge, analytics):
        charge(local(11, 20, 10), (0, 7, 2))
        charge(local(10, 5, 10), (0, 7, 3))
        charge(local(10, 6, 10), (0, 7, 1))
        charge(local(12, 1, 10, year=2025), (0, 7, 9))  # 11 months ago: still inside
        charge(local(10, 31, 10, year=2025), (0, 7, 4))  # 13 months ago: outside

        months = analytics()["monthly_data"]

        assert [(month["month_name"], month["year"]) for month in months] == [("November", 2026), ("October", 2026), ("December", 2025)]
        assert months[1]["month"] == 10
        assert (months[1]["total_kwh"], months[1]["total_records"]) == (4, 2)


class TestEnergyPerHour:
    def test_adds_up_the_kwh_per_hour_of_the_day(self, charge, analytics):
        charge(local(11, 20, 9), (0, 7, 1), (30, 3, 2.5))
        charge(local(11, 21, 18), (0, 11, 4))

        [year] = analytics()["hourly_by_year"]

        assert year["year"] == 2026
        assert len(year["hourly_kwh"]) == 24
        assert year["hourly_kwh"][9] == 2.5
        assert year["hourly_kwh"][18] == 4
        assert sum(year["hourly_kwh"]) == 6.5

    def test_one_series_per_year_for_the_last_three_years_oldest_first(self, charge, analytics):
        charge(local(5, 1, 10, year=2023), (0, 7, 8))  # four years ago: left out
        charge(local(5, 1, 10, year=2024), (0, 7, 3))
        charge(local(5, 1, 14, year=2026), (0, 7, 2))

        years = analytics()["hourly_by_year"]

        assert [year["year"] for year in years] == [2024, 2026]
        assert years[0]["hourly_kwh"][10] == 3
        assert years[1]["hourly_kwh"][14] == 2

    def test_uses_the_dutch_clock_in_summer_time_too(self, charge, analytics):
        charge(datetime(2026, 7, 1, 8, 0), (0, 7, 1))  # 08:00 UTC is 10:00 in Dutch summer time

        assert analytics()["hourly_by_year"][0]["hourly_kwh"][10] == 1

    def test_a_charge_that_started_before_the_three_years_counts_only_its_steps_inside(self, charge, analytics):
        # 2 kWh before midnight on New Year's Eve 2023, 1 kWh more after it.
        charge(local(12, 31, 23, 50, year=2023), (0, 7, 2), (20, 7, 3))

        [year] = analytics()["hourly_by_year"]

        assert (year["year"], year["hourly_kwh"][0], sum(year["hourly_kwh"])) == (2024, 1, 1)


class TestEndpoint:
    def test_needs_a_login(self, client):
        assert client.get("/power-logs/analytics").status_code == 401

    def test_returns_the_analytics(self, user, charge):
        charge(datetime.utcnow().replace(microsecond=0), (0, 7, 1), (5, 7, 3))

        body = user.get("/power-logs/analytics").json()

        assert body["current_year_summary"]["total_kwh"] == 3
        assert len(body["monthly_data"]) == 1
        assert [len(year["hourly_kwh"]) for year in body["hourly_by_year"]] == [24]
