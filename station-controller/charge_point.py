import logging
from datetime import datetime
from ocpp.v16 import ChargePoint as BaseChargePoint
from ocpp.v16 import call_result
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.routing import on

class ChargePoint(BaseChargePoint):
    """ Handles communication with the charging station. """

    def __init__(self, id, websocket):
        super().__init__(id, websocket)

        # No need for EventHandler now, handlers are directly here.

    # BootNotification event handler
    @on("BootNotification")
    async def on_boot_notification(self, charge_point_model, charge_point_vendor, firmware_version, charge_point_serial_number, reason, **kwargs):
        """ Handles BootNotification event. """
        logging.info(f"Raw BootNotification payload: {locals()}")

        charging_station = {
            "model": charge_point_model,
            "vendor": charge_point_vendor,
            "firmware": firmware_version,
            "serial": charge_point_serial_number
        }

        logging.info(f"BootNotification received from {self.id}: {charging_station}, Reason: {reason}")

        return call_result.BootNotification(
            current_time=datetime.utcnow().isoformat(),
            interval=10,
            status=RegistrationStatus.accepted
        )

    # Heartbeat event handler
    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        """ Handles Heartbeat event. """
        logging.info(f"Heartbeat received from {self.id}")
        return call_result.Heartbeat(current_time=datetime.utcnow().isoformat())

    # Authorize event handler
    @on("Authorize")
    async def on_authorize(self, id_tag, **kwargs):
        """ Handles Authorize event. """
        logging.info(f"Authorization request for idTag {id_tag}: Accepted")
        return call_result.AuthorizePayload(
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    # StartTransaction event handler
    @on("StartTransaction")
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        """ Handles StartTransaction event. """
        logging.info(f"StartTransaction: Connector {connector_id}, idTag {id_tag}")
        return call_result.StartTransactionPayload(
            transaction_id=12345,  # Example transaction ID
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    # SetChargingProfile event handler
    @on("SetChargingProfile")
    async def on_set_charging_profile(self, connector_id, cs_charging_profiles, **kwargs):
        """ Handles SetChargingProfile event. """
        # Assuming you have a method to apply charging profiles
        # Return a response based on the charging profile
        logging.info(f"SetChargingProfile received for Connector {connector_id}: {cs_charging_profiles}")
        return call_result.SetChargingProfilePayload(status=call_result.Status.accepted)