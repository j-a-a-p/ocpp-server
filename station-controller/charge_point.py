import logging
import asyncio
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
        
        # Dynamic load simulation parameters
        self.current_power_limit = 16.0  # Start at 16A
        self.min_power_limit = 8.0       # Minimum 8A
        self.max_power_limit = 32.0      # Maximum 32A
        self.power_step = 2.0            # Change by 2A each time
        self.dynamic_load_task = None

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

        # Start dynamic load simulation when charging station boots
        await self.start_dynamic_load_simulation()

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
        # Only try once every 10 heartbeats to avoid overwhelming the charging station
        if not hasattr(self, '_heartbeat_count'):
            self._heartbeat_count = 0
        self._heartbeat_count += 1
        
        if self._heartbeat_count % 10 == 0:  # Every 10th heartbeat
            try:
                # Set charging profile with current dynamic power limit
                await self.set_charging_profile(1, self.current_power_limit, ChargingRateUnitType.amps, profile_id=1)
                logging.info(f"✅ Charging profile with {self.current_power_limit}A sent on heartbeat {self._heartbeat_count} for {self.id}")
            except Exception as e:
                logging.warning(f"⚠️  Failed to send charging profile on heartbeat {self._heartbeat_count}: {e}")
        
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

    async def set_charging_profile(self, connector_id: int, power_limit: float, unit: ChargingRateUnitType = ChargingRateUnitType.amps, profile_id: int = 1):
        """
        Set a charging profile on the charging station via OCPP SetChargingProfile.
        
        Args:
            connector_id: The connector ID
            power_limit: The power limit value
            unit: The unit (amps or watts)
            profile_id: The charging profile ID
        """
        try:
            logging.info(f"Setting charging profile {profile_id} with {power_limit} {unit.value} limit on connector {connector_id}")
            
            # Create the SetChargingProfile request
            request = call.SetChargingProfile(
                connector_id=connector_id,
                cs_charging_profiles={
                    "chargingProfileId": profile_id,
                    "chargingProfilePurpose": ChargingProfilePurposeType.charge_point_max_profile,
                    "chargingProfileKind": "Absolute",
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
            
            # Send the request to the charging station via WebSocket with timeout
            try:
                response = await asyncio.wait_for(self.call(request), timeout=10.0)
                
                if response.status.value == "Accepted":
                    logging.info(f"✅ Charging profile {profile_id} with {power_limit} {unit.value} limit successfully set on connector {connector_id}")
                    return True
                else:
                    logging.error(f"❌ Failed to set charging profile: {response.status.value}")
                    return False
                    
            except asyncio.TimeoutError:
                logging.error(f"❌ Timeout waiting for SetChargingProfile response from charging station")
                return False
                
        except Exception as e:
            logging.error(f"❌ Error setting charging profile: {e}")
            return False

    async def start_dynamic_load_simulation(self):
        """Start the dynamic load simulation that changes power limit every 10 seconds."""
        if self.dynamic_load_task is None:
            logging.info(f"🚀 Starting dynamic load simulation for {self.id}...")
            self.dynamic_load_task = asyncio.create_task(self._dynamic_load_loop())
            logging.info(f"✅ Dynamic load simulation task created for {self.id}")
        else:
            logging.info(f"⚠️  Dynamic load simulation already running for {self.id}")


    async def _dynamic_load_loop(self):
        """Background task that changes power limit every 10 seconds."""
        import random
        
        logging.info(f"🔄 Dynamic load loop started for {self.id}")
        
        while True:
            try:
                # Randomly decide to increase or decrease power
                if random.choice([True, False]):
                    # Increase power
                    new_limit = min(self.current_power_limit + self.power_step, self.max_power_limit)
                    direction = "⬆️"
                else:
                    # Decrease power
                    new_limit = max(self.current_power_limit - self.power_step, self.min_power_limit)
                    direction = "⬇️"
                
                # Always update and apply the new limit (for testing)
                old_limit = self.current_power_limit
                self.current_power_limit = new_limit
                
                logging.info(f"🔄 Dynamic load: Attempting to change from {old_limit}A to {new_limit}A {direction}")
                
                # Apply the new charging profile
                success = await self.set_charging_profile(
                    connector_id=1,
                    power_limit=new_limit,
                    unit=ChargingRateUnitType.amps,
                    profile_id=1
                )
                
                if success:
                    logging.info(f"✅ Dynamic load: {direction} Power limit changed from {old_limit}A to {new_limit}A")
                else:
                    logging.warning(f"⚠️  Dynamic load: Failed to change power limit from {old_limit}A to {new_limit}A")
                    # Revert the current_power_limit if it failed
                    self.current_power_limit = old_limit
                
                # Wait 10 seconds before next change
                logging.info(f"⏰ Dynamic load: Waiting 10 seconds before next change...")
                await asyncio.sleep(10)
                
            except asyncio.CancelledError:
                logging.info(f"🛑 Dynamic load simulation cancelled for {self.id}")
                break
            except Exception as e:
                logging.error(f"❌ Error in dynamic load simulation: {e}")
                await asyncio.sleep(10)  # Wait before retrying

    def get_dynamic_load_status(self):
        """Get the current status of the dynamic load simulation."""
        return {
            "current_power_limit": self.current_power_limit,
            "min_power_limit": self.min_power_limit,
            "max_power_limit": self.max_power_limit,
            "power_step": self.power_step,
            "task_running": self.dynamic_load_task is not None and not self.dynamic_load_task.done()
        }

    async def trigger_dynamic_load_change(self):
        """Manually trigger a dynamic load change for testing."""
        import random
        
        logging.info(f"🔧 Manual dynamic load trigger for {self.id}")
        
        # Randomly decide to increase or decrease power
        if random.choice([True, False]):
            # Increase power
            new_limit = min(self.current_power_limit + self.power_step, self.max_power_limit)
            direction = "⬆️"
        else:
            # Decrease power
            new_limit = max(self.current_power_limit - self.power_step, self.min_power_limit)
            direction = "⬇️"
        
        # Always update and apply the new limit
        old_limit = self.current_power_limit
        self.current_power_limit = new_limit
        
        logging.info(f"🔧 Manual trigger: Attempting to change from {old_limit}A to {new_limit}A {direction}")
        
        # Apply the new charging profile
        success = await self.set_charging_profile(
            connector_id=1,
            power_limit=new_limit,
            unit=ChargingRateUnitType.amps,
            profile_id=1
        )
        
        if success:
            logging.info(f"✅ Manual trigger: {direction} Power limit changed from {old_limit}A to {new_limit}A")
        else:
            logging.warning(f"⚠️  Manual trigger: Failed to change power limit from {old_limit}A to {new_limit}A")
            # Revert the current_power_limit if it failed
            self.current_power_limit = old_limit

    async def clear_charging_profile(self, connector_id: int, profile_id: int = 1):
        """
        Clear a charging profile from the charging station via OCPP ClearChargingProfile.
        
        Args:
            connector_id: The connector ID
            profile_id: The charging profile ID to clear
        """
        try:
            logging.info(f"Clearing charging profile {profile_id} from connector {connector_id}")
            
            # Create the ClearChargingProfile request
            request = call.ClearChargingProfile(
                id=profile_id
            )
            
            # Send the request to the charging station via WebSocket
            response = await self.call(request)
            
            if response.status.value == "Accepted":
                logging.info(f"✅ Charging profile {profile_id} successfully cleared from connector {connector_id}")
                return True
            else:
                logging.error(f"❌ Failed to clear charging profile: {response.status.value}")
                return False
                
        except Exception as e:
            logging.error(f"❌ Error clearing charging profile: {e}")
            return False


    