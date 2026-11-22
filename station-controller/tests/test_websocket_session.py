"""A whole charge over a real WebSocket, with the same OCPP library a charger would use."""
import asyncio

import pytest
import websockets
from ocpp.v16 import ChargePoint as OcppClient
from ocpp.v16 import call

from main import on_connect
from models import ChargeTransaction, PowerLog, RefusedCard


def status_of(response) -> str:
    status = response.id_tag_info["status"]
    return str(getattr(status, "value", status))


@pytest.fixture
async def server_url(meter_file):
    server = await websockets.serve(on_connect, "127.0.0.1", 0, subprotocols=["ocpp1.6"])
    port = server.sockets[0].getsockname()[1]
    yield f"ws://127.0.0.1:{port}/CHARGER"
    server.close()
    await server.wait_closed()


async def test_a_card_is_tapped_and_a_charge_is_recorded(server_url, db, resident_with_card):
    async with websockets.connect(server_url, subprotocols=["ocpp1.6"]) as socket:
        charger = OcppClient("CHARGER", socket)
        listening = asyncio.create_task(charger.start())
        try:
            boot = await charger.call(call.BootNotification(charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123"))
            assert str(getattr(boot.status, "value", boot.status)) == "Accepted"

            assert status_of(await charger.call(call.Authorize(id_tag="04AABBCC"))) == "Accepted"
            started = await charger.call(call.StartTransaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="2026-11-22T08:00:00Z"))
            for minutes, power, energy in ((1, 7.0, 1.5), (2, 7.2, 3.0), (3, 7.1, 4.5)):
                await charger.call(call.MeterValues(
                    connector_id=1, transaction_id=started.transaction_id,
                    meter_value=[{"timestamp": f"2026-11-22T08:0{minutes}:00Z", "sampled_value": [
                        {"value": str(power), "measurand": "Power.Active.Import", "unit": "kW"},
                        {"value": str(energy), "measurand": "Energy.Active.Import.Register", "unit": "kWh"},
                    ]}],
                ))
            stopped = await charger.call(call.StopTransaction(transaction_id=started.transaction_id, meter_stop=4500, timestamp="2026-11-22T08:04:00Z"))
            assert status_of(stopped) == "Accepted"
        finally:
            listening.cancel()

    transaction = db.query(ChargeTransaction).one()
    assert transaction.id == started.transaction_id
    assert (transaction.station_id, transaction.rfid) == ("SER123", "04AABBCC")
    assert transaction.final_energy_kwh == 4.5
    assert [log.energy_kwh for log in db.query(PowerLog).order_by(PowerLog.id)] == [1.5, 3.0, 4.5]


async def test_an_unknown_card_gets_an_answer_and_is_remembered(server_url, db):
    async with websockets.connect(server_url, subprotocols=["ocpp1.6"]) as socket:
        charger = OcppClient("CHARGER", socket)
        listening = asyncio.create_task(charger.start())
        try:
            await charger.call(call.BootNotification(charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123"))
            response = await charger.call(call.Authorize(id_tag="DEADBEEF"))
        finally:
            listening.cancel()

    # The charger has to get a valid OCPP 1.6 refusal, not an error.
    assert status_of(response) == "Invalid"
    assert {(row.rfid, row.station_id) for row in db.query(RefusedCard)} == {("DEADBEEF", "SER123")}
