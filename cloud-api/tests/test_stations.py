"""Which charging stations are online, and when they were (GET /stations/, written from station_connections)."""
from datetime import datetime, timedelta

import pytest

from models import StationConnection
from station_status import ONLINE_GRACE, calculate_station_overview

NOW = datetime(2026, 11, 22, 12, 0, 0)


def at(day: int, hour: int, minute: int = 0) -> datetime:
    """A moment in November 2026, UTC."""
    return datetime(2026, 11, day, hour, minute)


@pytest.fixture
def connect(db):
    """A connection of a station. Without `ended` it is still open, and last_seen defaults to just before NOW
    for an open one and to the end for a closed one."""

    def make(station_id="CP1", started=at(22, 8), ended=None, last_seen=None) -> StationConnection:
        connection = StationConnection(
            station_id=station_id,
            connected_at=started,
            last_seen_at=last_seen or ended or NOW - timedelta(seconds=10),
            disconnected_at=ended,
        )
        db.add(connection)
        db.commit()
        return connection

    return make


@pytest.fixture
def overview(db):
    def calculate(hours=24):
        return calculate_station_overview(db, hours, now=NOW)

    return calculate


def only(result) -> dict:
    assert len(result["stations"]) == 1
    return result["stations"][0]


def spans(station: dict) -> list[tuple[datetime, datetime]]:
    return [
        (period["start"].replace(tzinfo=None), period["end"].replace(tzinfo=None))
        for period in station["online_periods"]
    ]


class TestOnline:
    def test_a_station_with_an_open_connection_that_was_heard_just_now_is_online(self, connect, overview):
        connect(started=at(22, 8))

        station = only(overview())

        assert station["station_id"] == "CP1"
        assert station["online"] is True
        assert station["connected_since"].replace(tzinfo=None) == at(22, 8)
        assert overview()["online_count"] == 1

    def test_an_open_connection_that_was_not_heard_for_a_while_is_not_online(self, connect, overview):
        # The station controller stopped without closing it, nobody has heard the station since.
        connect(started=at(22, 8), last_seen=NOW - ONLINE_GRACE - timedelta(seconds=1))

        station = only(overview())

        assert station["online"] is False
        assert station["connected_since"] is None
        assert overview()["online_count"] == 0

    def test_a_connection_that_ended_is_not_online(self, connect, overview):
        connect(started=at(22, 8), ended=at(22, 10))

        station = only(overview())

        assert station["online"] is False
        assert station["last_seen"].replace(tzinfo=None) == at(22, 10)

    def test_a_station_that_disconnected_later_than_its_last_heartbeat_was_seen_until_then(self, connect, overview):
        connect(started=at(22, 8), ended=at(22, 10), last_seen=at(22, 9, 59))

        assert only(overview())["last_seen"].replace(tzinfo=None) == at(22, 10)

    def test_stations_are_listed_by_id_and_counted_separately(self, connect, overview):
        connect("CP2", started=at(22, 9))
        connect("CP1", started=at(22, 8), ended=at(22, 9))

        result = overview()

        assert [(station["station_id"], station["online"]) for station in result["stations"]] == [("CP1", False), ("CP2", True)]
        assert result["online_count"] == 1

    def test_no_stations_is_an_empty_list(self, overview):
        result = overview()

        assert result["stations"] == []
        assert result["online_count"] == 0


class TestPeriodsAndUptime:
    def test_the_online_periods_and_the_uptime_of_the_window(self, connect, overview):
        # Online 00:00-06:00 and 08:00-now: 6 + 4 hours. The station first connected at 00:00, so it was
        # known for 12 hours of the window, not for all 24.
        connect(started=at(22, 0), ended=at(22, 6))
        connect(started=at(22, 8))

        station = only(overview())

        assert spans(station) == [(at(22, 0), at(22, 6)), (at(22, 8), NOW)]
        assert station["uptime_percent"] == 83.3
        assert station["connections"] == 2

    def test_a_connection_from_before_the_window_is_cut_off_at_its_start(self, connect, overview):
        connect(started=at(19, 12), ended=at(22, 6))

        station = only(overview())

        assert spans(station) == [(at(21, 12), at(22, 6))]
        assert station["uptime_percent"] == 75.0
        assert station["connections"] == 0

    def test_a_station_that_was_not_online_in_the_window_is_still_listed_as_offline(self, connect, overview):
        connect(started=at(19, 8), ended=at(19, 10))

        station = only(overview())

        assert station["online"] is False
        assert station["online_periods"] == []
        assert station["uptime_percent"] == 0.0
        assert station["connections"] == 0

    def test_a_new_station_is_not_counted_offline_for_the_time_before_it_existed(self, connect, overview):
        connect(started=NOW - timedelta(hours=1))

        station = only(overview())

        assert station["uptime_percent"] == 100.0
        assert station["first_seen"].replace(tzinfo=None) == NOW - timedelta(hours=1)

    def test_a_reconnect_that_overlaps_the_old_connection_is_one_period(self, connect, overview):
        # The station came back at 10:00, the controller noticed the old connection died at 10:05.
        connect(started=at(22, 8), ended=at(22, 10, 5))
        connect(started=at(22, 10))

        station = only(overview())

        assert spans(station) == [(at(22, 8), NOW)]
        assert station["connections"] == 2
        assert station["online"] is True
        assert station["connected_since"].replace(tzinfo=None) == at(22, 10)

    def test_a_connection_that_stopped_being_heard_ends_at_its_last_message(self, connect, overview):
        connect(started=at(22, 8), last_seen=at(22, 9))

        station = only(overview())

        assert spans(station) == [(at(22, 8), at(22, 9))]

    def test_a_longer_window_reaches_further_back(self, connect, overview):
        connect(started=at(19, 8), ended=at(19, 10))

        station = only(overview(hours=24 * 7))

        assert spans(station) == [(at(19, 8), at(19, 10))]
        assert station["connections"] == 1


class TestEndpoint:
    def test_needs_a_login(self, client):
        assert client.get("/stations/").status_code == 401

    def test_lists_the_stations_with_utc_timestamps(self, user, connect):
        # The endpoint looks at the real clock, so use times relative to it.
        started = datetime.utcnow() - timedelta(hours=2)
        connect(started=started, last_seen=datetime.utcnow() - timedelta(seconds=5))

        response = user.get("/stations/?hours=6")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["window_hours"] == 6
        assert body["online_count"] == 1
        station = body["stations"][0]
        assert station["station_id"] == "CP1"
        assert station["online"] is True
        assert station["connected_since"].endswith("Z")
        assert station["online_periods"][0]["start"].endswith("Z")
        assert body["generated_at"].endswith("Z")

    def test_the_window_is_a_day_when_not_given(self, user):
        assert user.get("/stations/").json()["window_hours"] == 24

    @pytest.mark.parametrize("hours", [0, -1, 24 * 31 + 1])
    def test_a_window_that_makes_no_sense_is_refused(self, user, hours):
        assert user.get(f"/stations/?hours={hours}").status_code == 422
