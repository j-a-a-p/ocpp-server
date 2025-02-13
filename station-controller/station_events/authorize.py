import logging
from ocpp.v16 import call_result, enums

def register(charge_point):
    """ Registers the Authorize event handler. """

    @charge_point.on("Authorize")
    async def on_authorize(id_tag, **kwargs):
        logging.info(f"Authorization request for idTag {id_tag}: Accepted")
        return call_result.AuthorizePayload(
            id_tag_info={"status": enums.AuthorizationStatus.accepted}
        )