import logging
from datetime import datetime
from ocpp.v16 import call_result, enums

def register(event_handler):
    """ Registers the BootNotification event handler. """

    @event_handler.cp.on("BootNotification")
    async def on_boot_notification(**kwargs):
        logging.info(f"Raw BootNotification payload: {kwargs}")

        charging_station = {
            "model": kwargs.get("charge_point_model", "Unknown Model"),
            "vendor": kwargs.get("charge_point_vendor", "Unknown Vendor"),
            "firmware": kwargs.get("firmware_version", "Unknown Firmware"),
            "serial": kwargs.get("charge_point_serial_number", "Unknown Serial")
        }

        reason = kwargs.get("reason", "Unknown")

        logging.info(f"BootNotification received from {event_handler.cp.id}: {charging_station}, Reason: {reason}")

        return call_result.BootNotification(
            current_time=datetime.utcnow().isoformat(),
            interval=10,
            status=enums.RegistrationStatus.accepted
        )