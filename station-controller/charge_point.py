import logging
from ocpp.v16 import ChargePoint as BaseChargePoint
from event_handler import EventHandler

logging.basicConfig(level=logging.INFO)

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.event_handler = EventHandler(self)  # Automatically registers handlers

    async def start(self):
        """ Starts listening for incoming OCPP messages. """
        while True:
            try:
                message = await self._connection.recv()
                await self.route_message(message)
            except Exception as e:
                logging.error(f"Error processing message: {e}")
                break