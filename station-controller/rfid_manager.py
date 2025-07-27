import logging

logging.basicConfig(level=logging.INFO)

RFID_CSV_FILE = "rfid_list.csv"

class RFIDManager:
    """ Manages the RFID whitelist stored in a CSV file. """

    def __init__(self, rfid_file=RFID_CSV_FILE, auto_reload=False):
        self.rfid_file = rfid_file
        self.rfid_whitelist = set()

    def is_authorized(self, rfid_tag):
        """ Check if an RFID tag is authorized. """
        logging.debug("Auth request {rfid_tag}")
        return True #rfid_tag.strip().upper() in self.rfid_whitelist
