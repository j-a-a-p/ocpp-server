import logging
from ocpp.v16 import call_result
from ocpp.v16.enums import ChargingRateUnitType, ChargingProfilePurposeType, ChargingProfileStatus

class ChargingProfileManager:
    """ Manages charging power limits via OCPP SetChargingProfile. """

    def __init__(self, charge_point):
        self.cp = charge_point
        self.active_profiles = {}  # Store active profiles per connector

    async def apply_profile(self, connector_id, cs_charging_profiles):
        """ Sets a charging profile with a power limit. """
        
        try:
            logging.info(f"Applying charging profile for connector {connector_id}")
            
            # Extract charging profile data
            profile = cs_charging_profiles.get("chargingProfile", {})
            charging_schedule = profile.get("chargingSchedule", {})
            charging_schedule_periods = charging_schedule.get("chargingSchedulePeriod", [])
            
            if not charging_schedule_periods:
                logging.warning(f"No charging schedule periods found for connector {connector_id}")
                return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)
            
            # Get the first period (most common case for simple power limiting)
            first_period = charging_schedule_periods[0]
            power_limit = first_period.get("limit")
            unit = charging_schedule.get("chargingRateUnit", ChargingRateUnitType.watts)
            
            if power_limit is None:
                logging.warning(f"No power limit found in charging profile for connector {connector_id}")
                return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)
            
            # Store the active profile
            self.active_profiles[connector_id] = {
                "profile": profile,
                "power_limit": power_limit,
                "unit": unit,
                "schedule": charging_schedule
            }
            
            logging.info(f"Power limit set to {power_limit} {unit.value} on connector {connector_id}")
            
            # Here you would typically send the power limit to the charging station hardware
            # This depends on your specific charging station implementation
            await self._apply_power_limit_to_hardware(connector_id, power_limit, unit)
            
            return call_result.SetChargingProfile(status=ChargingProfileStatus.accepted)
            
        except Exception as e:
            logging.error(f"Failed to set charging profile: {e}")
            return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)
    
    async def _apply_power_limit_to_hardware(self, connector_id, power_limit, unit):
        """Apply power limit to the charging station hardware."""
        try:
            # Convert to watts if needed
            if unit == ChargingRateUnitType.amps:
                # Assuming 230V single phase or 400V three phase
                # You'll need to implement proper voltage detection
                voltage = 230  # Default voltage, should be detected from hardware
                power_limit_watts = power_limit * voltage
            elif unit == ChargingRateUnitType.watts:
                power_limit_watts = power_limit
            else:
                logging.warning(f"Unsupported charging rate unit: {unit}")
                return
            
            logging.info(f"Applying {power_limit_watts}W power limit to connector {connector_id}")
            
            # TODO: Implement hardware-specific power limiting
            # This could involve:
            # - Sending commands to the charging station's power electronics
            # - Communicating with a power management system
            # - Adjusting PWM signals or other control mechanisms
            
            # Example implementation (replace with your hardware interface):
            # await self.cp.send_power_limit_command(connector_id, power_limit_watts)
            
        except Exception as e:
            logging.error(f"Failed to apply power limit to hardware: {e}")
    
    def get_active_profile(self, connector_id):
        """Get the currently active charging profile for a connector."""
        return self.active_profiles.get(connector_id)
        
    async def set_simple_power_limit(self, connector_id, power_limit_watts):
        """Set a simple power limit without complex scheduling."""
        try:
            # Create a simple charging profile
            profile = {
                "chargingProfile": {
                    "connectorId": connector_id,
                    "chargingProfilePurpose": ChargingProfilePurposeType.charge_point_max_profile,
                    "stackLevel": 0,
                    "chargingSchedule": {
                        "duration": 0,  # No duration limit
                        "chargingRateUnit": ChargingRateUnitType.watts,
                        "chargingSchedulePeriod": [
                            {
                                "startPeriod": 0,
                                "limit": power_limit_watts
                            }
                        ]
                    }
                }
            }
            
            return await self.apply_profile(connector_id, profile)
            
        except Exception as e:
            logging.error(f"Failed to set simple power limit: {e}")
            return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)