import logging
import uuid
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.routing import on
from rfid_log import RFIDLog
from meter_values_log import MeterValuesLog
from transaction_log import TransactionLog

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.rfid = RFIDLog()
        self.meter_values = MeterValuesLog()
        self.transations = TransactionLog()

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
            interval=10,
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

        if self.rfid.is_authorized(id_tag):
            logging.info(f"RFID {id_tag} authorized")
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )
        else:
            logging.warning(f"RFID {id_tag} not authorized")
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        """ Handle a StartTransaction event and log it. """
        logging.info(f"StartTransaction {kwargs}")
        #todo add rfid check (maybe unneccessary)
        
        transaction_id = str(uuid.uuid4())
        self.transations.log_transaction(transaction_id, connector_id, id_tag, meter_start, timestamp)

        return call_result.StartTransaction(
            transaction_id=transaction_id,
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on("MeterValues")
    async def on_meter_values(self, connector_id, transaction_id, meter_value):
        """Handles MeterValues event and logs readings to file."""
        logging.info(f"Received MeterValues for connector {connector_id}, transaction {transaction_id}")

        self.meter_values.log_meter_values(connector_id, transaction_id, meter_value)

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