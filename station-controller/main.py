import asyncio
import logging
import os
import websockets
from charge_point import ChargePoint
from init_db import init_database
from station_connection_service import StationConnectionService

# Configure logging - set OCPP library to DEBUG to reduce noise, keep our app at INFO
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Set OCPP library logging to DEBUG to reduce the SetChargingProfile message noise
logging.getLogger('ocpp').setLevel(logging.WARNING)

def requested_path(websocket, path="no_station"):
    """The URL path the charger connected to. Newer websockets versions do not pass it to the handler
    any more, it is on the request of the connection. Without it the station is only known after its
    BootNotification, and a charger that reconnects does not send one."""
    request = getattr(websocket, "request", None)
    requested = getattr(request, "path", None) or path
    return requested.split("?")[0]

LOCAL_ADDRESSES = ("127.0.0.1", "::1")

def client_address(websocket):
    """Where the charger connects from, for the log.

    A charger that connects straight to this port is seen with its own address and port. Through the web
    server every connection comes from this machine, then the real address is the last one in
    X-Forwarded-For: that is the one the web server added. The ones before it come from the charger
    itself and can be made up, so they are never used. The header is only believed on a connection from
    this machine, because anyone else could send it too."""
    remote = getattr(websocket, "remote_address", None)
    if not remote:
        return "an unknown address"
    host, port = remote[0], remote[1]
    if host in LOCAL_ADDRESSES:
        headers = getattr(getattr(websocket, "request", None), "headers", None)
        forwarded = headers.get("X-Forwarded-For") if headers is not None else None
        if forwarded and forwarded.split(",")[-1].strip():
            return f"{forwarded.split(',')[-1].strip()} (through the web server)"
    return f"{host} port {port}"

async def on_connect(websocket, path="no_station"):
    """ Handle new charge point connections. """
    path = requested_path(websocket, path)
    logging.info(f"On Connect {path}")
    charge_point_id = path.strip('/')
    logging.info(f"New ChargePoint connected: {charge_point_id} from {client_address(websocket)}")

    cp = ChargePoint(charge_point_id, websocket)
    await cp.start()

async def main():
    # Initialize database
    init_database()
    logging.info("Database initialized")

    # No station is connected yet, so connections that are still open are from the previous run
    closed = StationConnectionService.close_open()
    if closed:
        logging.info(f"Closed {closed} station connection(s) that were open when the controller stopped")
    
    # This port speaks plain ws://. Chargers connect to it straight (ws://<domain>:9000/<station id>), or
    # with wss:// to the web server (Apache), which ends the TLS and passes the connection on. By default
    # it listens on this machine only. The server's systemd service and the Docker setup set
    # OCPP_BIND_HOST=0.0.0.0: on the server for the chargers, in Docker for the web server container.
    host = os.environ.get('OCPP_BIND_HOST', '127.0.0.1')
    server = await websockets.serve(on_connect, host, 9000, subprotocols=['ocpp1.6'])
    logging.info(f"WebSocket Server Started on ws://{host}:9000")
    await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(main())
