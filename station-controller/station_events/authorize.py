import logging
from ocpp.v16 import call_result, enums

def register(event_handler):
    """ Registers the Authorize event handler. """

    @event_handler.cp.on("Authorize")
    async def on_authorize(id_tag, **kwargs):
        logging.info(f"Authorization request for idTag {id_tag}: Accepted")
        return call_result.AuthorizePayload(
            id_tag_info={"status": enums.AuthorizationStatus.accepted}
        )