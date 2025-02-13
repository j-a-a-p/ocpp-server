import logging
from datetime import datetime
from ocpp.routing import on
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from charging_profile import ChargingProfileManager

class EventHandler:
    """ Handles OCPP events like BootNotification, Authorize, and StartTransaction. """

    def __init__(self, charge_point):
        self.cp = charge_point
        self.charging_profile_manager = ChargingProfileManager(self.cp)

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
            current_time=datetime.utcnow().isoformat(),
            interval=10,
            status=RegistrationStatus.accepted
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        logging.info(f"Heartbeat received from {self.id}")
        return call_result.Heartbeat(current_time=datetime.utcnow().isoformat())

    @on("BootNotificationOld")
    async def on_boot_notification_old(self, charging_station, reason, **kwargs):
        """ Handles BootNotification from the charge point. """
        logging.info(f"BootNotification received: {charging_station}, Reason: {reason}")
        return call_result.BootNotificationPayload(
            current_time=datetime.utcnow().isoformat(),
            interval=10,
            status=RegistrationStatus.accepted
        )

    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles authorization requests and accepts all ID tags. """
        logging.info(f"Authorization request for idTag {id_tag}: Accepted")
        return call_result.AuthorizePayload(
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        """ Handles StartTransaction events and accepts all transactions. """
        logging.info(f"StartTransaction: Connector {connector_id}, idTag {id_tag}")
        return call_result.StartTransactionPayload(
            transaction_id=12345,  # Example transaction ID
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on("SetChargingProfile")
    async def on_set_charging_profile(self, connector_id, cs_charging_profiles, **kwargs):
        """ Handles dynamic charging power control. """
        return await self.charging_profile_manager.apply_profile(connector_id, cs_charging_profiles)