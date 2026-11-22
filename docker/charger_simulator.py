"""Simulated OCPP 1.6 charging stations for local development.

Every station in dev-data.json connects to the station controller the way a real
charger does (through the web server's /ws/<station id>), boots, sends heartbeats
and lets people tap RFID cards. A session is: Authorize, StartTransaction, a
MeterValues message every few seconds, StopTransaction.

Sessions are time compressed: with the default SIM_TIME_SCALE of 60, one real
second counts as one simulated minute, so a few hours of charging take a few
minutes and a session adds a realistic amount of energy.

Cards tap by themselves (SIM_AUTO=1), and there is a control page on port 8090
to tap a card or stop a session by hand.

Settings (environment):
  SIM_SERVER_URL       default ws://web/ws
  SIM_TIME_SCALE       default 60
  SIM_METER_INTERVAL   seconds between MeterValues, default 5
  SIM_AUTO             1 (default) lets cards tap by themselves, 0 for manual only
  SIM_IDLE_MIN/MAX     seconds between automatic taps per station, default 20 and 60
  SIM_CONTROL_PORT     default 8090
"""
import asyncio
import json
import logging
import os
import random
import threading
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import websockets
from ocpp.v16 import ChargePoint as OcppChargePoint
from ocpp.v16 import call

SERVER_URL = os.environ.get("SIM_SERVER_URL", "ws://web/ws").rstrip("/")
TIME_SCALE = float(os.environ.get("SIM_TIME_SCALE", "60"))
METER_INTERVAL = float(os.environ.get("SIM_METER_INTERVAL", "5"))
AUTO = os.environ.get("SIM_AUTO", "1") == "1"
IDLE_MIN = float(os.environ.get("SIM_IDLE_MIN", "20"))
IDLE_MAX = float(os.environ.get("SIM_IDLE_MAX", "60"))
CONTROL_PORT = int(os.environ.get("SIM_CONTROL_PORT", "8090"))
DEV_DATA_PATH = os.environ.get("DEV_DATA", "/app/dev-data.json")
VOLTAGE = 230.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("ocpp").setLevel(logging.WARNING)
log = logging.getLogger("simulator")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def status_of(response) -> str:
    """The status of a response, whether the library gives a string or an enum."""
    return str(getattr(response.status, "value", response.status))


class Link(OcppChargePoint):
    """The charger side of the OCPP connection. The server never calls us, so no handlers."""


class Station:
    def __init__(self, config: dict, cards: list[dict], unknown_cards: list[str]):
        self.id = config["id"]
        self.max_kw = float(config.get("max_kw", 11.0))
        self.cards = cards
        self.unknown_cards = unknown_cards
        self.queue: asyncio.Queue = asyncio.Queue()
        self.stop_requested = asyncio.Event()
        self.connected = False
        self.busy = False
        self.status = "Disconnected"
        self.card = ""
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.note = ""

    # --- connection -------------------------------------------------------------

    async def run(self) -> None:
        delay = 2
        while True:
            try:
                async with websockets.connect(f"{SERVER_URL}/{self.id}", subprotocols=["ocpp1.6"]) as connection:
                    delay = 2
                    link = Link(self.id, connection)
                    tasks = [asyncio.create_task(link.start()), asyncio.create_task(self.behave(link))]
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for task in pending:
                        task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)
                    for task in done:
                        task.result()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # the server may be starting or restarting, so retry
                log.warning("%s: connection problem (%s), retrying in %ss", self.id, error, delay)
            self.connected = False
            self.busy = False
            self.status = "Disconnected"
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)

    async def behave(self, link: Link) -> None:
        boot = await link.call(
            call.BootNotification(
                charge_point_model="Simulator",
                charge_point_vendor="Mock",
                charge_point_serial_number=self.id,  # the station controller identifies stations by this
                firmware_version="sim-1.0",
            )
        )
        self.connected = True
        log.info("%s: booted, server says %s", self.id, status_of(boot))
        await self.notify(link, "Available")
        heartbeat = asyncio.create_task(self.heartbeat(link, getattr(boot, "interval", 30) or 30))
        try:
            while True:
                card = await self.next_tap()
                self.busy = True
                try:
                    await self.charge(link, card)
                finally:
                    self.busy = False
                    while not self.queue.empty():  # taps made while charging are stale now
                        self.queue.get_nowait()
        finally:
            heartbeat.cancel()

    async def heartbeat(self, link: Link, interval: int) -> None:
        while True:
            await asyncio.sleep(interval)
            await link.call(call.Heartbeat())

    async def notify(self, link: Link, status: str) -> None:
        self.status = status
        await link.call(
            call.StatusNotification(connector_id=1, error_code="NoError", status=status, timestamp=utc_now())
        )

    # --- taps -------------------------------------------------------------------

    def automatic_card(self) -> str:
        if self.unknown_cards and (not self.cards or random.random() < 0.15):
            return random.choice(self.unknown_cards)
        return random.choice(self.cards)["rfid"]

    async def next_tap(self) -> str:
        if not AUTO:
            return await self.queue.get()
        try:
            return await asyncio.wait_for(self.queue.get(), random.uniform(IDLE_MIN, IDLE_MAX))
        except asyncio.TimeoutError:
            return self.automatic_card()

    # --- one charging session ---------------------------------------------------

    def measurements(self, power_kw: float, energy_kwh: float) -> list[dict]:
        amps = power_kw * 1000 / (3 * VOLTAGE)
        sampled = [
            {"value": f"{power_kw:.3f}", "measurand": "Power.Active.Import", "unit": "kW"},
            {"value": f"{energy_kwh:.3f}", "measurand": "Energy.Active.Import.Register", "unit": "kWh"},
        ]
        for phase in ("L1", "L2", "L3"):
            sampled.append({"value": f"{amps:.2f}", "measurand": "Current.Import", "phase": phase, "unit": "A"})
            sampled.append(
                {
                    "value": f"{VOLTAGE + random.uniform(-3, 3):.1f}",
                    "measurand": "Voltage",
                    "phase": phase,
                    "unit": "V",
                }
            )
        for sample in sampled:
            sample["context"] = "Sample.Periodic"
        return [{"timestamp": utc_now(), "sampled_value": sampled}]

    def power_at(self, fraction: float) -> float:
        if fraction < 0.05:
            level = 0.3 + 0.7 * (fraction / 0.05)
        elif fraction > 0.75:
            level = 1.0 - 0.6 * ((fraction - 0.75) / 0.25)
        else:
            level = 1.0
        return self.max_kw * level * random.uniform(0.97, 1.0)

    async def charge(self, link: Link, rfid: str) -> None:
        self.card = rfid
        self.note = ""
        log.info("%s: card %s tapped", self.id, rfid)
        authorized = await link.call(call.Authorize(id_tag=rfid))
        # An error answer (the library returns None) counts as not authorized too.
        verdict = authorized.id_tag_info.get("status") if authorized is not None else None
        if str(getattr(verdict, "value", verdict)) != "Accepted":
            log.info("%s: card %s refused", self.id, rfid)
            self.note = f"Card {rfid} was refused"
            self.card = ""
            return

        await self.notify(link, "Preparing")
        started = await link.call(
            call.StartTransaction(connector_id=1, id_tag=rfid, meter_start=0, timestamp=utc_now())
        )
        transaction_id = started.transaction_id
        await self.notify(link, "Charging")
        log.info("%s: transaction %s started for %s", self.id, transaction_id, rfid)

        planned_hours = random.uniform(1.5, 5.0)  # simulated time
        elapsed_hours = 0.0
        energy = 0.0
        self.stop_requested.clear()
        while elapsed_hours < planned_hours and not self.stop_requested.is_set():
            try:
                await asyncio.wait_for(self.stop_requested.wait(), METER_INTERVAL)
                break
            except asyncio.TimeoutError:
                pass
            step_hours = METER_INTERVAL * TIME_SCALE / 3600
            elapsed_hours += step_hours
            self.power_kw = self.power_at(elapsed_hours / planned_hours)
            energy += self.power_kw * step_hours
            self.energy_kwh = energy
            await link.call(
                call.MeterValues(
                    connector_id=1,
                    transaction_id=transaction_id,
                    meter_value=self.measurements(self.power_kw, energy),
                )
            )

        # Like the real chargers, report zero at the end of the session.
        self.power_kw = 0.0
        await link.call(
            call.MeterValues(connector_id=1, transaction_id=transaction_id, meter_value=self.measurements(0.0, 0.0))
        )
        await link.call(
            call.StopTransaction(
                meter_stop=int(energy * 1000),
                timestamp=utc_now(),
                transaction_id=transaction_id,
                id_tag=rfid,
                reason="Local",
            )
        )
        log.info("%s: transaction %s finished, %.2f kWh", self.id, transaction_id, energy)
        self.note = f"Last session: {energy:.2f} kWh"
        await self.notify(link, "Finishing")
        await asyncio.sleep(2)
        self.card = ""
        self.energy_kwh = 0.0
        await self.notify(link, "Available")


# --- control page ----------------------------------------------------------------

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Charger simulator</title>
<style>
 body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #222; }
 .station { border: 1px solid #ddd; border-radius: 6px; padding: .8rem 1rem; margin: 1rem 0; }
 .station h3 { margin: 0 0 .4rem; }
 .Charging { border-left: 6px solid #2e9e4f; } .Available { border-left: 6px solid #1677ff; }
 .Disconnected { border-left: 6px solid #bbb; }
 button { margin: .2rem .3rem .2rem 0; padding: .3rem .7rem; cursor: pointer; }
 .meta { color: #555; font-size: .9rem; margin-bottom: .4rem; }
</style></head><body>
<h1>Charger simulator</h1>
<p>Mock OCPP chargers connected to the station controller. Tap a card to start a session.
Sessions are time compressed, see DOCKER.md.</p>
<div id="stations"></div>
<script>
async function act(path, params) {
  const response = await fetch(path + '?' + new URLSearchParams(params), { method: 'POST' });
  if (!response.ok) { alert(await response.text()); }
  refresh();
}
function button(label, handler) {
  const element = document.createElement('button');
  element.textContent = label;
  element.onclick = handler;
  return element;
}
async function refresh() {
  const stations = await (await fetch('/state')).json();
  const root = document.getElementById('stations');
  root.replaceChildren();
  for (const station of stations) {
    const box = document.createElement('div');
    box.className = 'station ' + (station.status === 'Charging' ? 'Charging' : station.connected ? 'Available' : 'Disconnected');
    const title = document.createElement('h3');
    title.textContent = station.id + ' (' + station.max_kw + ' kW max)';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = station.status + (station.card ? ' | card ' + station.card : '')
      + (station.status === 'Charging' ? ' | ' + station.power_kw.toFixed(1) + ' kW, ' + station.energy_kwh.toFixed(2) + ' kWh' : '')
      + (station.note ? ' | ' + station.note : '');
    box.append(title, meta);
    for (const card of station.cards) {
      box.append(button('Tap ' + card.name, () => act('/tap', { station: station.id, rfid: card.rfid })));
    }
    if (station.unknown_card) {
      box.append(button('Tap unknown card', () => act('/tap', { station: station.id, rfid: station.unknown_card })));
    }
    box.append(button('Stop charging', () => act('/stop', { station: station.id })));
    root.append(box);
  }
}
refresh();
setInterval(refresh, 2000);
</script></body></html>"""


def make_handler(loop: asyncio.AbstractEventLoop, stations: dict[str, Station]):
    class Control(BaseHTTPRequestHandler):
        def reply(self, status: int, content_type: str, body: str) -> None:
            payload = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args) -> None:
            pass

        def do_GET(self) -> None:
            path = urllib.parse.urlparse(self.path).path
            if path == "/":
                self.reply(200, "text/html; charset=utf-8", PAGE)
            elif path == "/state":
                state = [
                    {
                        "id": station.id,
                        "max_kw": station.max_kw,
                        "connected": station.connected,
                        "status": station.status,
                        "card": station.card,
                        "power_kw": station.power_kw,
                        "energy_kwh": station.energy_kwh,
                        "note": station.note,
                        "cards": station.cards,
                        "unknown_card": station.unknown_cards[0] if station.unknown_cards else "",
                    }
                    for station in stations.values()
                ]
                self.reply(200, "application/json", json.dumps(state))
            else:
                self.reply(404, "text/plain", "not found")

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            station = stations.get(query.get("station", [""])[0])
            if station is None:
                self.reply(404, "text/plain", "Unknown station")
            elif parsed.path == "/tap":
                if not station.connected:
                    self.reply(409, "text/plain", f"{station.id} is not connected")
                elif station.busy:
                    self.reply(409, "text/plain", f"{station.id} is busy, stop the session first")
                else:
                    loop.call_soon_threadsafe(station.queue.put_nowait, query.get("rfid", [""])[0].upper())
                    self.reply(200, "text/plain", "ok")
            elif parsed.path == "/stop":
                loop.call_soon_threadsafe(station.stop_requested.set)
                self.reply(200, "text/plain", "ok")
            else:
                self.reply(404, "text/plain", "not found")

    return Control


async def main() -> None:
    with open(DEV_DATA_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    cards = [card for resident in data["residents"] for card in resident["cards"]]
    stations = {
        config["id"]: Station(config, cards, data.get("unknown_cards", [])) for config in data["stations"]
    }

    loop = asyncio.get_running_loop()
    server = ThreadingHTTPServer(("0.0.0.0", CONTROL_PORT), make_handler(loop, stations))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log.info(
        "Control page on port %s, %s station(s), time scale %s, automatic taps %s",
        CONTROL_PORT, len(stations), TIME_SCALE, "on" if AUTO else "off",
    )

    await asyncio.gather(*(station.run() for station in stations.values()))


if __name__ == "__main__":
    asyncio.run(main())
