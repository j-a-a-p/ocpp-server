import logging
from ocpp.v16 import ChargePoint as BaseChargePoint
from event_handlers import EventHandler
from authorize_handler import AuthorizeHandler

logging.basicConfig(level=logging.INFO)

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.handler = EventHandler(self)
        self.auth_handler = AuthorizeHandler()


    async def start(self):
        """ Starts listening for incoming OCPP messages. """
        while True:
            try:
                message = await self._connection.recv()
                await self.route_message(message)
            except Exception as e:
                logging.error(f"Error processing message: {e}")
                break