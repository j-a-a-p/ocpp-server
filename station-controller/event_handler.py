import logging
import importlib
import pkgutil
import station_events  # Import the station_events package

class EventHandler:
    """ Dynamically loads and registers event handlers for OCPP messages. """

    def __init__(self, charge_point):
        self.cp = charge_point
        self._register_event_handlers()

    def _register_event_handlers(self):
        """ Auto-discovers and registers event handlers from the station_events folder. """
        for _, module_name, _ in pkgutil.iter_modules(station_events.__path__):
            try:
                module = importlib.import_module(f"station_events.{module_name}")

                if hasattr(module, "register"):
                    handler_function = module.register(self.cp)  # Get event handler function
                    event_name = module_name.replace("_", "").lower()  # Normalize event name

                    # Dynamically attach the function to ChargePoint
                    setattr(self.cp, f"on_{event_name}", handler_function)
                    logging.info(f"Registered event handler: {event_name}")
                else:
                    logging.warning(f"Module {module_name} has no register function.")
            except Exception as e:
                logging.error(f"Failed to register event handler {module_name}: {e}")