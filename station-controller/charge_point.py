import logging
import csv
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.routing import on
from rfid_manager import RFIDManager
from meter_values_manager import MeterValuesManager

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.rfid_manager = RFIDManager(rfid_file="rfid_list.csv", auto_reload=True)

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
            current_time=datetime.now(datetime.timezone.utc).isoformat(),
            interval=10,
            status=RegistrationStatus.accepted
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        """ Handles Heartbeat event. """
        logging.info(f"Heartbeat received from {self.id}")
        return call_result.Heartbeat(current_time=datetime.utcnow().isoformat())

    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles Authorize event and checks if the RFID is authorized. """
        logging.info(f"Authorization request for idTag {id_tag}")

        if self.rfid_manager.is_authorized(id_tag):
            logging.info(f"RFID {id_tag} authorized")
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )
        else:
            logging.warning(f"RFID {id_tag} not authorized")
            self.log_rejected_rfid(id_tag)
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        """ Handles StartTransaction event. """
        logging.info(f"StartTransaction: Connector {connector_id}, idTag {id_tag}, meter start {meter_start}")
        #todo add rfid check (maybe unneccessary)
        return call_result.StartTransaction(
            transaction_id=12345,
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    def log_rejected_rfid(self, rfid_tag):
        """ Appends rejected RFID tags with a timestamp to the rejected_rfids.csv file. """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            with open("rejected_rfids.csv", mode="a", newline="", encoding="utf-8") as file:
                writer = csv.writer(file)
                # Check if the file is empty to write the header only once
                if file.tell() == 0:
                    writer.writerow(["RFID", "Timestamp"])  # Add header row if file is empty
                writer.writerow([rfid_tag, timestamp])
            logging.info(f"Rejected RFID {rfid_tag} logged with timestamp {timestamp}.")
        except Exception as e:
            logging.error(f"Failed to log rejected RFID {rfid_tag}: {e}")

    @on("MeterValues")
    async def on_meter_values(self, **kwargs):
        """Handles MeterValues event and logs readings to file."""
        connector_id = kwargs.get("connectorId")
        transaction_id = kwargs.get("transactionId")
        meter_values = kwargs.get("meterValue", [])

        logging.info(f"Received MeterValues for connector {connector_id}, transaction {transaction_id}")

        self.meter_values_manager.log_meter_values(connector_id, transaction_id, meter_values)

        return call_result.MeterValuesPayload()