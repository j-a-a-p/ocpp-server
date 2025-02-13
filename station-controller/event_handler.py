import logging
import importlib
import pkgutil
from ocpp.routing import on
from charging_profile import ChargingProfileManager

class EventHandler:
    """ Dynamically loads and registers event handlers for OCPP messages. """

    def __init__(self, charge_point):
        self.cp = charge_point
        self.charging_profile_manager = ChargingProfileManager(self.cp)
        self._register_event_handlers()

    def _register_event_handlers(self):
        """ Dynamically loads event handlers from station_events folder. """
        import station_events

        for _, module_name, _ in pkgutil.iter_modules(station_events.__path__):
            module = importlib.import_module(f"station_events.{module_name}")
            if hasattr(module, "register"):
                module.register(self)

        logging.info("All event handlers registered successfully.")