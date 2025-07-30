import logging
from ocpp.v16 import call_result
from rfid_manager import RFIDManager

logging.basicConfig(level=logging.INFO)

class AuthorizeHandler:
    """ Handles authorization based on an RFID whitelist stored in a CSV file. """

    def __init__(self):
        self.rfid_manager = RFIDManager()

    async def on_authorize(self, id_tag, station_id=None):
        """ Handle the Authorize event from the OCPP server. """
        if self.rfid_manager.is_authorized(id_tag, station_id):
            logging.info(f"Authorization successful for RFID {id_tag}")
            return call_result.AuthorizePayload(id_tag_info={"status": "Accepted"})
        else:
            logging.info(f"Unauthorized RFID attempt: {id_tag}")
            return call_result.AuthorizePayload(id_tag_info={"status": "Rejected"})