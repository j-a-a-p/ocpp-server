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
        self.rfid_manager = RFIDManager()
        self.meter_values_manager = MeterValuesManager(charge_point=self)
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
        # await self.start_dynamic_load_simulation()  # DISABLED: Power simulation disabled

        return call_result.BootNotification(
            current_time=datetime.now().isoformat(),
            interval=30,
            status=RegistrationStatus.accepted
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        """ Handles Heartbeat event and ensures charging profile is applied. """
        logging.debug(f"Heartbeat received from {self.id}")
        
        # Initialize heartbeat counter and set charger to 32A on first heartbeat
        if not hasattr(self, '_heartbeat_count'):
            self._heartbeat_count = 0
            logging.info(f"🔄 First heartbeat from {self.id}, setting charger to 32A")
            try:
                # Set charging profile to 32A on first heartbeat
                await self.set_charging_profile(1, 32.0, ChargingRateUnitType.amps, profile_id=1)
                logging.info(f"✅ Successfully set charger {self.id} to 32A")
            except Exception as e:
                logging.warning(f"⚠️  Failed to set charger to 32A on first heartbeat: {e}")
        
        self._heartbeat_count += 1
        
        # DISABLED: Power simulation disabled - no longer applying dynamic charging profiles
        # if self._heartbeat_count % 10 == 0:  # Every 10th heartbeat
        #     try:
        #         # Set charging profile with current dynamic power limit
        #         await self.set_charging_profile(1, self.current_power_limit, ChargingRateUnitType.amps, profile_id=1)
        #     except Exception as e:
        #         logging.warning(f"⚠️  Failed to send charging profile on heartbeat: {e}")
        
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
        max_retries = 3
        base_delay = 1.0
        
        for attempt in range(max_retries):
            try:
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
                    
                    if response.status == "Accepted":
                        return True
                    else:
                        logging.error(f"❌ Failed to set charging profile: {response.status}")
                        return False
                        
                except asyncio.TimeoutError:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logging.warning(f"⚠️  Timeout on attempt {attempt + 1}/{max_retries}, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logging.error(f"❌ Timeout waiting for SetChargingProfile response from charging station after {max_retries} attempts")
                        return False
                except ConnectionError as e:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logging.warning(f"⚠️  WebSocket connection error on attempt {attempt + 1}/{max_retries}, retrying in {delay}s: {e}")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logging.warning(f"⚠️  WebSocket connection error during SetChargingProfile: {e}")
                        return False
                except Exception as e:
                    error_str = str(e).lower()
                    if any(phrase in error_str for phrase in [
                        "no close frame received or sent",
                        "protocol error",
                        "invalid opcode",
                        "1002"
                    ]):
                        # These WebSocket errors are often harmless - the request might have succeeded
                        # The charging station may have processed the request before the connection issue
                        return True
                    else:
                        if attempt < max_retries - 1:
                            delay = base_delay * (2 ** attempt)
                            logging.warning(f"⚠️  Unexpected error on attempt {attempt + 1}/{max_retries}, retrying in {delay}s: {e}")
                            await asyncio.sleep(delay)
                            continue
                        else:
                            logging.error(f"❌ Unexpected error during SetChargingProfile: {e}")
                            return False
                    
            except Exception as e:
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logging.warning(f"⚠️  Error on attempt {attempt + 1}/{max_retries}, retrying in {delay}s: {e}")
                    await asyncio.sleep(delay)
                    continue
                else:
                    logging.error(f"❌ Error setting charging profile: {e}")
                    return False
        
        return False

    async def start_dynamic_load_simulation(self):
        """Start the dynamic load simulation that changes power limit every 10 seconds."""
        if self.dynamic_load_task is None:
            try:
                self.dynamic_load_task = asyncio.create_task(self._dynamic_load_loop())
            except Exception as e:
                logging.error(f"❌ Error creating dynamic load simulation task for {self.id}: {e}")
        else:
            if self.dynamic_load_task.done():
                # Clean up and restart
                self.dynamic_load_task = None
                await self.start_dynamic_load_simulation()


    async def _dynamic_load_loop(self):
        """Background task that changes power limit every 10 seconds."""
        import random
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
                
                # Apply the new charging profile
                success = await self.set_charging_profile(
                    connector_id=1,
                    power_limit=new_limit,
                    unit=ChargingRateUnitType.amps,
                    profile_id=1
                )
                
                if success:
                    # Power limit changed successfully
                    pass
                else:
                    logging.warning(f"⚠️  Dynamic load: Failed to change from {old_limit}A to {new_limit}A")
                    # Revert the current_power_limit if it failed
                    self.current_power_limit = old_limit
                    # Add extra delay on failure to allow connection to stabilize
                    await asyncio.sleep(2)
                
                # Wait 10 seconds before next change
                await asyncio.sleep(10)
                
            except asyncio.CancelledError:
                logging.info(f"🛑 Dynamic load simulation cancelled for {self.id}")
                break
            except Exception as e:
                logging.error(f"❌ Error in dynamic load simulation: {e}")
                await asyncio.sleep(10)  # Wait before retrying

    async def force_power_limit(self, power_limit: float):
        """Force a specific power limit for testing."""
        old_limit = self.current_power_limit
        self.current_power_limit = power_limit
        
        success = await self.set_charging_profile(
            connector_id=1,
            power_limit=power_limit,
            unit=ChargingRateUnitType.amps,
            profile_id=1
        )
        
        if success:
            # Force power limit applied successfully
            pass
        else:
            logging.warning(f"⚠️  Force power limit failed: {old_limit}A → {power_limit}A")
            self.current_power_limit = old_limit

    def get_dynamic_load_status(self):
        """Get the current status of the dynamic load simulation."""
        task_running = False
        task_done = False
        task_cancelled = False
        
        if self.dynamic_load_task:
            task_running = not self.dynamic_load_task.done()
            task_done = self.dynamic_load_task.done()
            task_cancelled = self.dynamic_load_task.cancelled()
        
        return {
            "current_power_limit": self.current_power_limit,
            "min_power_limit": self.min_power_limit,
            "max_power_limit": self.max_power_limit,
            "power_step": self.power_step,
            "task_running": task_running,
            "task_done": task_done,
            "task_cancelled": task_cancelled,
            "task_exists": self.dynamic_load_task is not None
        }

    async def restart_dynamic_load_simulation(self):
        """Restart the dynamic load simulation."""
        # Stop current simulation
        if self.dynamic_load_task:
            self.dynamic_load_task.cancel()
            self.dynamic_load_task = None
        
        # Wait a moment
        await asyncio.sleep(1)
        
        # Start new simulation
        await self.start_dynamic_load_simulation()

    async def trigger_dynamic_load_change(self):
        """Manually trigger a dynamic load change for testing."""
        import random
        
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
        
        # Apply the new charging profile
        success = await self.set_charging_profile(
            connector_id=1,
            power_limit=new_limit,
            unit=ChargingRateUnitType.amps,
            profile_id=1
        )
        
        if success:
            # Manual trigger successful
            pass
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
            # Create the ClearChargingProfile request
            request = call.ClearChargingProfile(
                id=profile_id
            )
            
            # Send the request to the charging station via WebSocket
            response = await self.call(request)
            
            if response.status.value == "Accepted":
                return True
            else:
                logging.error(f"❌ Failed to clear charging profile: {response.status.value}")
                return False
                
        except Exception as e:
            logging.error(f"❌ Error clearing charging profile: {e}")
            return False


    