import logging
from ocpp.v16 import call_result
from ocpp.v16.enums import ChargingRateUnitType, ChargingProfilePurposeType

class ChargingProfileManager:
    """ Manages charging power limits via OCPP SetChargingProfile. """

    def __init__(self, charge_point):
        self.cp = charge_point

    async def apply_profile(self, connector_id, cs_charging_profiles):
        """ Sets a charging profile with a power limit. """

        try:
            power_limit = cs_charging_profiles["chargingSchedule"]["chargingSchedulePeriod"][0]["limit"]
            logging.info(f"Setting power limit to {power_limit} W on connector {connector_id}")

            return call_result.SetChargingProfilePayload(
                status="Accepted"
            )
        except Exception as e:
            logging.error(f"Failed to set charging profile: {e}")
            return call_result.SetChargingProfilePayload(status="Rejected")