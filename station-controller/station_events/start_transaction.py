import logging
from ocpp.v16 import call_result, enums

def register(charge_point):
    """ Registers the StartTransaction event handler. """

    @charge_point.on("StartTransaction")
    async def on_start_transaction(connector_id, id_tag, meter_start, timestamp, **kwargs):
        logging.info(f"StartTransaction: Connector {connector_id}, idTag {id_tag}")
        return call_result.StartTransactionPayload(
            transaction_id=12345,
            id_tag_info={"status": enums.AuthorizationStatus.accepted}
        )