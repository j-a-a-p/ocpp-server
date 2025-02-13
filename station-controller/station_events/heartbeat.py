import logging
from datetime import datetime
from ocpp.v16 import call_result

def register(event_handler):
    """ Registers the Heartbeat event handler. """

    @event_handler.cp.on("Heartbeat")
    async def on_heartbeat(**kwargs):
        logging.info(f"Heartbeat received from {event_handler.cp.id}")
        return call_result.Heartbeat(current_time=datetime.utcnow().isoformat())