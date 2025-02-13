import asyncio
import logging
import websockets
from charge_point import ChargePoint

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

async def on_connect(websocket, path):
    """ Handle new charge point connections. """
    charge_point_id = path.strip('/')
    logging.info(f"New ChargePoint connected: {charge_point_id}")

    cp = ChargePoint(charge_point_id, websocket)
    await cp.start()

async def main():
    server = await websockets.serve(on_connect, '0.0.0.0', 9000, subprotocols=['ocpp1.6'])
    logging.info("WebSocket Server Started on ws://0.0.0.0:9000")
    await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(main())