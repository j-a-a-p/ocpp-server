import logging
from ocpp.v16 import ChargePoint as BaseChargePoint
from event_handler import EventHandler

logging.basicConfig(level=logging.INFO)

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.handler = EventHandler(self)