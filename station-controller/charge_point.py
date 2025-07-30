import logging
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.routing import on
from rfid_manager import RFIDManager
from meter_values_manager import MeterValuesManager
from transaction_service import TransactionService
from refused_card_service import RefusedCardService
import uuid

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.rfid_manager = RFIDManager(rfid_file="rfid_list.csv", auto_reload=False)
        self.meter_values_manager = MeterValuesManager()

    @on("BootNotification")
    async def on_boot_notification(self, **kwargs):
        logging.info(f"Raw BootNotification payload: {kwargs}")

        # Extract values safely
        charging_station = {
            "model": kwargs.get("charge_point_model", "Unknown Model"),
            "vendor": kwargs.get("charge_point_vendor", "Unknown Vendor"),
            "firmware": kwargs.get("firmware_version", "Unknown Firmware"),
            "serial": kwargs.get("charge_point_serial_number", "Unknown Serial")
        }
        reason = kwargs.get("reason", "Unknown")
        logging.info(f"BootNotification received from {self.id}: {charging_station}, Reason: {reason}")

        return call_result.BootNotification(
            current_time=datetime.now().isoformat(),
            interval=30,
            status=RegistrationStatus.accepted
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        """ Handles Heartbeat event. """
        logging.info(f"Heartbeat received from {self.id}")
        return call_result.Heartbeat(current_time=datetime.now().isoformat())

    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles Authorize event and checks if the RFID is authorized. """
        logging.info(f"Authorization request for idTag {id_tag}")

        if self.rfid_manager.is_authorized(id_tag, self.id):
            logging.info(f"RFID {id_tag} authorized")
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )
        else:
            logging.warning(f"RFID {id_tag} not authorized")
            self.log_rejected_rfid(id_tag)
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.rejected}
            )

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        logging.info(f"StartTransaction {kwargs}")
        #todo add rfid check (maybe unneccessary)
        transaction_id = uuid.uuid4().int >> 64
        
        # Store transaction in database
        try:
            transaction = TransactionService.create_transaction(
                station_name=self.id,
                rfid=id_tag
            )
            logging.info(f"Transaction stored in database with ID: {transaction.id}")
        except Exception as e:
            logging.error(f"Failed to store transaction in database: {e}, for card: {id_tag}")
        
        return call_result.StartTransaction(
            transaction_id=transaction_id,
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    def log_rejected_rfid(self, rfid_tag):
        """ Store rejected RFID tags in the database. """
        try:
            refused_card = RefusedCardService.create_refused_card(
                station_id=self.id,
                rfid=rfid_tag
            )
            logging.info(f"Rejected RFID {rfid_tag} stored in database with ID: {refused_card.id}")
        except Exception as e:
            logging.error(f"Failed to store rejected RFID {rfid_tag} in database: {e}")

    @on("MeterValues")
    async def on_meter_values(self, connector_id, transaction_id, meter_value):
        """Handles MeterValues event and logs readings to file."""
        logging.info(f"Received MeterValues for connector {connector_id}, transaction {transaction_id}")

        self.meter_values_manager.log_meter_values(connector_id, transaction_id, meter_value)

        return call_result.MeterValues()

    @on("StatusNotification")
    async def on_status_notification(self, connector_id, error_code, status, timestamp=None, info=None, vendor_id=None, vendor_error_code=None):
        """Handle the StatusNotification event from the charge point."""

        logging.info(f"StatusNotification received: Connector {connector_id}, Status {status}, Error {error_code}, Timestamp {timestamp}")

        # You can store this status data in a log file or a database
        #with open("status_notifications.csv", "a", newline="", encoding="utf-8") as file:
        #    writer = csv.writer(file)
        #    writer.writerow([connector_id, error_code, status, timestamp, info, vendor_id, vendor_error_code])

        return call_result.StatusNotification()
