import asyncio
import logging
import websockets
from charge_point import ChargePoint
from init_db import init_database

# Configure logging - set OCPP library to DEBUG to reduce noise, keep our app at INFO
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Set OCPP library logging to DEBUG to reduce the SetChargingProfile message noise
logging.getLogger('ocpp').setLevel(logging.WARNING)

async def on_connect(websocket, path="no_station"):
    """ Handle new charge point connections. """
    logging.info(f"On Connect {path}")
    charge_point_id = path.strip('/')
    logging.info(f"New ChargePoint connected: {charge_point_id}")

    cp = ChargePoint(charge_point_id, websocket)
    await cp.start()

async def main():
    # Initialize database
    init_database()
    logging.info("Database initialized")
    
    server = await websockets.serve(on_connect, '0.0.0.0', 9000, subprotocols=['ocpp1.6'])
    logging.info("WebSocket Server Started on ws://0.0.0.0:9000")
    await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(main())
