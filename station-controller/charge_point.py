import logging
import uuid
import requests
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.routing import on
from loggers.meter_values_log import MeterValuesLog
from loggers.transaction_log import TransactionLog

# Server Configuration
SERVER_URL = "http://localhost:8000"

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, charge_point_id, websocket):
        super().__init__(charge_point_id, websocket)
        self.meter_values = MeterValuesLog(self.id)
        self.transactions = TransactionLog(self.id)

    @on("BootNotification")
    async def on_boot_notification(self, **kwargs):
        logging.info(f"Raw BootNotification payload: {kwargs}")

        charging_station = {
            "model": kwargs.get("charge_point_model", "Unknown Model"),
            "vendor": kwargs.get("charge_point_vendor", "Unknown Vendor"),
            "firmware": kwargs.get("firmware_version", "Unknown Firmware"),
            "serial": kwargs.get("charge_point_serial_number", "Unknown Serial"),
        }
        reason = kwargs.get("reason", "Unknown")
        logging.info(f"BootNotification received from {self.id}: {charging_station}, Reason: {reason}")

        return call_result.BootNotification(
            current_time=datetime.now().isoformat(),
            interval=10,
            status=RegistrationStatus.accepted,
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        """ Handles Heartbeat event. """
        logging.info(f"Heartbeat received from {self.id}")
        return call_result.Heartbeat(current_time=datetime.now().isoformat())

    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles Authorize event and checks if the RFID is authorized via the server. """
        logging.info(f"Authorization request for idTag {id_tag}")

        try:
            response = requests.get(f"{SERVER_URL}/authenticate/{id_tag}", params={"station_id": self.id})
            if response.status_code == 200:
                logging.info(f"RFID {id_tag} authorized")
                return call_result.Authorize(id_tag_info={"status": AuthorizationStatus.accepted})
            else:
                logging.warning(f"RFID {id_tag} not authorized: {response.json().get('detail')}")
                return call_result.Authorize(id_tag_info={"status": AuthorizationStatus.rejected})
        except requests.RequestException as e:
            logging.error(f"Error connecting to auth server: {e}")
            return call_result.Authorize(id_tag_info={"status": AuthorizationStatus.rejected})

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        """ Handle a StartTransaction event and log it. """
        logging.info(f"StartTransaction {kwargs}")

        try:
            response = requests.get(f"{SERVER_URL}/authenticate/{id_tag}", params={"station_id": self.id})
            if response.status_code == 200:
                transaction_id = str(uuid.uuid4())
                self.transactions.log_transaction(timestamp, transaction_id, connector_id, id_tag, meter_start, None, None)

                return call_result.StartTransaction(
                    transaction_id=transaction_id,
                    id_tag_info={"status": AuthorizationStatus.accepted},
                )
            else:
                logging.warning(f"Refusing transaction from unregistered RFID tag {id_tag}")
                return call_result.StartTransaction(
                    transaction_id="refused",
                    id_tag_info={"status": AuthorizationStatus.rejected},
                )
        except requests.RequestException as e:
            logging.error(f"Error connecting to auth server: {e}")
            return call_result.StartTransaction(
                transaction_id="error",
                id_tag_info={"status": AuthorizationStatus.rejected},
            )

    @on("StopTransaction")
    async def on_stop_transaction(self, transaction_id, meter_stop, timestamp, reason=None, **kwargs):
        """ Handle a StopTransaction event and log it. """
        id_tag = kwargs.get("id_tag", "Unknown")
        self.transactions.log_transaction(timestamp, transaction_id, None, id_tag, None, meter_stop, reason or "Stopped")

        return call_result.StopTransaction()

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

        return call_result.StatusNotification()