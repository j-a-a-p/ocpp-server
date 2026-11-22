"""The address of a charger in the log: its own when it connects straight, the one from the proxy otherwise."""
import asyncio
import logging
from types import SimpleNamespace

import pytest
import websockets
from ocpp.v16 import ChargePoint as OcppClient
from ocpp.v16 import call

from main import client_address, on_connect


def connection(remote, forwarded=None):
    """What the handler gets: a peer address, and the headers of the request."""
    headers = {"X-Forwarded-For": forwarded} if forwarded is not None else {}
    return SimpleNamespace(remote_address=remote, request=SimpleNamespace(headers=headers))


class TestClientAddress:
    def test_a_charger_that_connects_straight_is_seen_with_its_own_address_and_port(self):
        assert client_address(connection(("203.0.113.5", 6000))) == "203.0.113.5 port 6000"

    def test_through_the_web_server_the_address_comes_from_the_header(self):
        assert client_address(connection(("127.0.0.1", 41234), forwarded="203.0.113.5")) == "203.0.113.5 (through the web server)"

    def test_through_the_web_server_over_ipv6_loopback_too(self):
        assert client_address(connection(("::1", 41234), forwarded="203.0.113.5")) == "203.0.113.5 (through the web server)"

    def test_only_the_last_address_of_the_header_counts(self):
        # The first ones were sent by the charger itself, the last one is added by the web server.
        assert client_address(connection(("127.0.0.1", 1), forwarded="6.6.6.6, 203.0.113.5")) == "203.0.113.5 (through the web server)"

    def test_the_header_is_not_believed_from_anyone_but_the_web_server(self):
        assert client_address(connection(("203.0.113.9", 7777), forwarded="6.6.6.6")) == "203.0.113.9 port 7777"

    def test_from_this_machine_without_a_header_it_is_the_peer(self):
        assert client_address(connection(("127.0.0.1", 5555))) == "127.0.0.1 port 5555"

    def test_without_an_address_it_is_unknown(self):
        assert client_address(connection(None)) == "an unknown address"
        assert client_address(SimpleNamespace()) == "an unknown address"


async def test_the_connect_is_logged_with_the_address_of_the_charger(meter_file, caplog):
    server = await websockets.serve(on_connect, "127.0.0.1", 0, subprotocols=["ocpp1.6"])
    port = server.sockets[0].getsockname()[1]
    try:
        with caplog.at_level(logging.INFO):
            async with websockets.connect(f"ws://127.0.0.1:{port}/CHARGER", subprotocols=["ocpp1.6"]) as socket:
                charger = OcppClient("CHARGER", socket)
                listening = asyncio.create_task(charger.start())
                try:
                    await charger.call(call.Heartbeat())
                finally:
                    listening.cancel()
    finally:
        server.close()
        await server.wait_closed()

    assert any(
        "New ChargePoint connected: CHARGER from 127.0.0.1 port" in record.getMessage() for record in caplog.records
    )
