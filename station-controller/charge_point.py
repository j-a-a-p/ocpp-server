import logging
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result, call
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus, ChargingProfileStatus, ChargingRateUnitType, ChargingProfilePurposeType
from ocpp.routing import on
from rfid_manager import RFIDManager
from meter_values_manager import MeterValuesManager
from transaction_service import TransactionService
from refused_card_service import RefusedCardService
from charging_profile import ChargingProfileManager

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)
        self.rfid_manager = RFIDManager(rfid_file="rfid_list.csv", auto_reload=False)
        self.meter_values_manager = MeterValuesManager()
        self.charging_profile_manager = ChargingProfileManager(self)

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
        """ Handles Heartbeat event and ensures charging profile is applied. """
        logging.debug(f"Heartbeat received from {self.id}")
        
        # Send charging profile on heartbeat to ensure it's maintained
        try:
            # Send default 16A power limit
            await self.send_power_limit(1, 16.0, ChargingRateUnitType.amps)
            logging.info(f"✅ Charging profile sent on heartbeat for {self.id}")
        except Exception as e:
            logging.warning(f"⚠️  Failed to send charging profile on heartbeat: {e}")
        
        return call_result.Heartbeat(current_time=datetime.now().isoformat())

    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles Authorize event and checks if the RFID is authorized. """
        logging.debug(f"Authorization request for idTag {id_tag}")

        if self.rfid_manager.is_authorized(id_tag, self.id):
            logging.info(f"RFID {id_tag} authorized")
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.accepted}
            )
        else:
            logging.info(f"RFID {id_tag} not authorized")
            self.log_rejected_rfid(id_tag)
            return call_result.Authorize(
                id_tag_info={"status": AuthorizationStatus.rejected}
            )

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        logging.info(f"StartTransaction {kwargs}")        
        
        # Store transaction in database
        try:
            transaction = TransactionService.create_transaction(
                station_id=self.id,
                rfid=id_tag
            )
            logging.info(f"Transaction stored in database with ID: {transaction.id}")
        except Exception as e:
            logging.error(f"Failed to store transaction in database: {e}, for card: {id_tag}")
        
        # Set default power limit when charging starts
        try:
            logging.info(f"🔌 Setting default power limit of 16A for new transaction")
            power_limit_success = await self.send_power_limit(
                connector_id, 
                16.0, 
                ChargingRateUnitType.amps
            )
            
            if power_limit_success:
                logging.info(f"✅ Default power limit of 16A set successfully for transaction {transaction.id}")
            else:
                logging.warning(f"⚠️  Failed to set default power limit for transaction {transaction.id}")
                
        except Exception as e:
            logging.error(f"❌ Error setting default power limit: {e}")
        
        return call_result.StartTransaction(
            transaction_id=transaction.id,
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
        logging.debug(f"Received MeterValues for connector {connector_id}, transaction {transaction_id}")

        self.meter_values_manager.log_meter_values(connector_id, transaction_id, meter_value)

        return call_result.MeterValues()

    @on("StatusNotification")
    async def on_status_notification(self, connector_id, error_code, status, timestamp=None, info=None, vendor_id=None, vendor_error_code=None):
        """Handle the StatusNotification event from the charge point."""

        logging.info(f"StatusNotification received: Connector {connector_id}, Status {status}, Error {error_code}, Timestamp {timestamp}")

        return call_result.StatusNotification()

    @on("StopTransaction")
    async def on_stop_transaction(self, transaction_id, id_tag, meter_stop, timestamp, **kwargs):
        """Handle the StopTransaction event from the charge point."""
        
        logging.info(f"StopTransaction received: Transaction {transaction_id}, RFID {id_tag}, Meter stop {meter_stop}")

        return call_result.StopTransaction(
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on("SetChargingProfile")
    async def on_set_charging_profile(self, connector_id, cs_charging_profiles, **kwargs):
        """Handle SetChargingProfile requests from the charging station."""
        logging.info(f"SetChargingProfile received for connector {connector_id}")
        
        try:
            # Use the existing charging profile manager to handle the profile
            result = await self.charging_profile_manager.apply_profile(connector_id, cs_charging_profiles)
            return result
        except Exception as e:
            logging.error(f"Error handling SetChargingProfile: {e}")
            return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)

    async def send_power_limit(self, connector_id: int, power_limit: float, unit: ChargingRateUnitType = ChargingRateUnitType.amps):
        """
        Send a power limit to the charging station via OCPP SetChargingProfile.
        
        Args:
            connector_id: The connector ID
            power_limit: The power limit value
            unit: The unit (amps or watts)
        """
        try:
            logging.info(f"Sending power limit of {power_limit} {unit.value} to connector {connector_id}")
            
            # Create the SetChargingProfile request
            request = call.SetChargingProfile(
                connector_id=connector_id,
                cs_charging_profiles={
                    "connectorId": connector_id,
                    "chargingProfilePurpose": ChargingProfilePurposeType.charge_point_max_profile,
                    "stackLevel": 0,
                    "chargingSchedule": {
                        "duration": 0,  # No duration limit
                        "chargingRateUnit": unit,
                        "chargingSchedulePeriod": [
                            {
                                "startPeriod": 0,
                                "limit": power_limit
                            }
                        ]
                    }
                }
            )
            
            # Send the request to the charging station via WebSocket
            response = await self.call(request)
            
            if response.status.value == "Accepted":
                logging.info(f"✅ Power limit of {power_limit} {unit.value} successfully sent to connector {connector_id}")
                return True
            else:
                logging.error(f"❌ Failed to send power limit: {response.status.value}")
                return False
                
        except Exception as e:
            logging.error(f"❌ Error sending power limit: {e}")
            return False


    