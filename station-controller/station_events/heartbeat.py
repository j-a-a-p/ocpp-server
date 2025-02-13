import logging
from datetime import datetime
from ocpp.v16 import call_result

def register(charge_point):
    """ Registers the Heartbeat event handler. """

    async def on_heartbeat(**kwargs):
        logging.info(f"Heartbeat received from {charge_point.id}")
        return call_result.Heartbeat(current_time=datetime.utcnow().isoformat())

    return "Heartbeat", on_heartbeat