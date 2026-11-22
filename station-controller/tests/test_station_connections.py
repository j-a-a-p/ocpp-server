"""Recording when the charging stations are online, for the stations page of the management portal."""
import asyncio
from datetime import datetime

import pytest
import websockets
from ocpp.v16 import ChargePoint as OcppClient
from ocpp.v16 import call
from sqlalchemy import text, update

from charge_point import ChargePoint
from main import on_connect
from models import StationConnection
from station_connection_service import StationConnectionService

LONG_AGO = datetime(2026, 1, 1, 12, 0, 0)


def connections(db) -> list[StationConnection]:
    db.expire_all()  # other sessions wrote them
    return db.query(StationConnection).order_by(StationConnection.id).all()


def only_connection(db) -> StationConnection:
    rows = connections(db)
    assert len(rows) == 1
    return rows[0]


def make_it_old(db) -> None:
    """Moves last_seen_at far back, so a later change to it shows."""
    db.execute(update(StationConnection).values(last_seen_at=LONG_AGO))
    db.commit()


class TestService:
    def test_a_new_connection_is_open(self, db):
        connection_id = StationConnectionService.open("CP1")

        row = only_connection(db)
        assert row.id == connection_id
        assert row.station_id == "CP1"
        assert row.disconnected_at is None
        assert row.last_seen_at == row.connected_at

    def test_seen_moves_last_seen_forward(self, db):
        connection_id = StationConnectionService.open("CP1")
        make_it_old(db)

        StationConnectionService.seen(connection_id)

        assert only_connection(db).last_seen_at > LONG_AGO

    def test_close_fills_the_moment_of_disconnecting_once(self, db):
        connection_id = StationConnectionService.open("CP1")

        StationConnectionService.close(connection_id)
        first = only_connection(db).disconnected_at
        StationConnectionService.close(connection_id)

        assert first is not None
        assert only_connection(db).disconnected_at == first

    def test_a_closed_connection_is_not_seen_any_more(self, db):
        connection_id = StationConnectionService.open("CP1")
        StationConnectionService.close(connection_id)
        make_it_old(db)

        StationConnectionService.seen(connection_id)

        assert only_connection(db).last_seen_at == LONG_AGO

    def test_rename_changes_the_station(self, db):
        connection_id = StationConnectionService.open("no_station")

        StationConnectionService.rename(connection_id, "SER123")

        assert only_connection(db).station_id == "SER123"

    def test_connections_that_were_open_when_the_controller_stopped_end_at_their_last_message(self, db):
        StationConnectionService.open("CP1")
        make_it_old(db)
        closed = StationConnectionService.open("CP2")
        StationConnectionService.close(closed)

        assert StationConnectionService.close_open() == 1

        first, second = connections(db)
        assert first.disconnected_at == LONG_AGO
        assert second.disconnected_at is not None

    def test_a_database_problem_is_not_raised(self, test_database):
        with test_database.begin() as connection:
            connection.execute(text("DROP TABLE station_connections"))

        # The station has to be able to charge, also when this cannot be recorded.
        assert StationConnectionService.open("CP1") is None
        StationConnectionService.seen(1)
        StationConnectionService.close(1)
        assert StationConnectionService.close_open() is None


class TestChargePoint:
    @pytest.fixture
    def cp(self, meter_file):
        return ChargePoint("CP1", websocket=None)

    async def test_a_heartbeat_shows_that_the_station_is_there(self, cp, db):
        cp.connection_id = StationConnectionService.open("CP1")
        make_it_old(db)

        await cp.on_heartbeat()

        assert only_connection(db).last_seen_at > LONG_AGO

    async def test_messages_that_follow_each_other_quickly_are_written_once(self, cp, db):
        cp.connection_id = StationConnectionService.open("CP1")
        await cp.on_heartbeat()
        make_it_old(db)

        await cp.on_heartbeat()

        assert only_connection(db).last_seen_at == LONG_AGO

    async def test_the_station_is_known_by_its_serial_number_after_boot(self, cp, db):
        cp.connection_id = StationConnectionService.open("CP1")

        await cp.on_boot_notification(
            charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123",
        )

        assert only_connection(db).station_id == "SER123"

    async def test_a_station_without_a_stored_connection_still_works(self, cp):
        assert cp.connection_id is None

        assert (await cp.on_heartbeat()).current_time
        await cp.on_status_notification(connector_id=1, error_code="NoError", status="Available")


async def eventually(check, timeout=3.0):
    """Waits until check() is true. The server notices a closed connection a moment later."""
    deadline = asyncio.get_running_loop().time() + timeout
    while not check():
        assert asyncio.get_running_loop().time() < deadline, "did not happen in time"
        await asyncio.sleep(0.05)


@pytest.fixture
async def server_url(meter_file):
    server = await websockets.serve(on_connect, "127.0.0.1", 0, subprotocols=["ocpp1.6"])
    port = server.sockets[0].getsockname()[1]
    yield f"ws://127.0.0.1:{port}"
    server.close()
    await server.wait_closed()


class TestOverAWebSocket:
    async def test_a_station_is_online_while_connected_and_disconnected_after(self, server_url, db):
        async with websockets.connect(f"{server_url}/CHARGER", subprotocols=["ocpp1.6"]) as socket:
            charger = OcppClient("CHARGER", socket)
            listening = asyncio.create_task(charger.start())
            try:
                await charger.call(call.BootNotification(charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123"))
                await charger.call(call.Heartbeat())

                row = only_connection(db)
                assert row.station_id == "SER123"
                assert row.disconnected_at is None
            finally:
                listening.cancel()

        await eventually(lambda: only_connection(db).disconnected_at is not None)
        assert only_connection(db).station_id == "SER123"

    async def test_a_station_that_reconnects_without_booting_is_known_by_the_name_in_the_address(self, server_url, db):
        # After a dropped connection a charger does not send a BootNotification again.
        async with websockets.connect(f"{server_url}/CHARGER", subprotocols=["ocpp1.6"]) as socket:
            charger = OcppClient("CHARGER", socket)
            listening = asyncio.create_task(charger.start())
            try:
                await charger.call(call.Heartbeat())
            finally:
                listening.cancel()

        assert only_connection(db).station_id == "CHARGER"
        await eventually(lambda: only_connection(db).disconnected_at is not None)

    async def test_every_connection_of_a_station_is_a_row_of_its_own(self, server_url, db):
        for _ in range(2):
            async with websockets.connect(f"{server_url}/CHARGER", subprotocols=["ocpp1.6"]) as socket:
                charger = OcppClient("CHARGER", socket)
                listening = asyncio.create_task(charger.start())
                try:
                    await charger.call(call.Heartbeat())
                finally:
                    listening.cancel()
            await eventually(lambda: all(row.disconnected_at is not None for row in connections(db)))

        assert [row.station_id for row in connections(db)] == ["CHARGER", "CHARGER"]
