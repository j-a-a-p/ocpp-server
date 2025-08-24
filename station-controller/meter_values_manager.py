import logging
import json
from power_log_service import PowerLogService

METER_VALUES_JSON = "/var/www/html/meter_values.json"

class MeterValuesManager:
    """Manages logging of meter values to a condensed JSON file."""

    def __init__(self, json_path=METER_VALUES_JSON, charge_point=None):
        self.json_path = json_path
        self.charge_point = charge_point

    def log_meter_values(self, connector_id, transaction_id, meter_values):
        """Logs meter values to the condensed JSON file."""
        try:
            if not meter_values:
                logging.warning("No meter values provided to log.")
                return

            logging.debug(f"Received meter_values: {meter_values}")

            entries_logged = 0
            condensed_data = {
                "timestamp": "",
                "connectorId": connector_id,
                "transactionId": transaction_id,
                "data": {},
                "chargingProfile": {
                    "name": "max_power",
                    "currentMaxPower": 0.0
                }
            }
            
            # Variables to track power and energy values for PowerLog
            power_kw = None
            energy_kwh = None

            for meter_value in meter_values:
                timestamp = meter_value.get("timestamp", "")
                sampled_values = meter_value.get("sampled_value", [])

                if not sampled_values:
                    logging.warning(f"No sampled_value found in meter_value: {meter_value}")
                    continue

                for sample in sampled_values:
                    measurand = sample.get("measurand", "Unknown")
                    phase = sample.get("phase", "")
                    unit = sample.get("unit", "")
                    value = sample.get("value", "0")

                    entries_logged += 1

                    # Condense to JSON
                    key = measurand if not phase else f"{measurand}.{phase}"
                    condensed_data["data"][key] = float(value)
                    condensed_data["timestamp"] = timestamp
                    
                    # Extract power and energy values for PowerLog
                    try:
                        float_value = float(value)
                        if measurand == "Power.Active.Import" and unit == "kW":
                            power_kw = float_value
                        elif measurand == "Energy.Active.Import.Register" and unit == "kWh":
                            energy_kwh = float_value
                    except (ValueError, TypeError):
                        logging.warning(f"Could not convert value '{value}' to float for measurand '{measurand}'")

            # Add charging profile information if available
            if self.charge_point:
                try:
                    profile_status = self.charge_point.get_dynamic_load_status()
                    condensed_data["chargingProfile"]["currentMaxPower"] = profile_status["current_power_limit"]
                    logging.debug(f"Added charging profile info: {profile_status['current_power_limit']}A")
                except Exception as e:
                    logging.warning(f"Failed to get charging profile status: {e}")
            
            self._write_condensed_json(condensed_data)
            
            # Create PowerLog record if we have power or energy data
            if power_kw is not None or energy_kwh is not None:
                try:
                    # Use 0.0 as default if values are None
                    power_kw = power_kw if power_kw is not None else 0.0
                    energy_kwh = energy_kwh if energy_kwh is not None else 0.0
                    
                    # Skip creating power log if energy drops to zero (end of charging)
                    if energy_kwh == 0.0:
                        logging.debug(f"Skipping PowerLog creation for transaction {transaction_id}: energy dropped to zero (end of charging)")
                    else:
                        PowerLogService.create_power_log(
                            charge_transaction_id=transaction_id,
                            power_kw=power_kw,
                            energy_kwh=energy_kwh
                        )
                        
                        # Update the transaction's final_energy_kwh with the latest energy value
                        if energy_kwh is not None and energy_kwh > 0:
                            PowerLogService.update_transaction_final_energy(
                                transaction_id=transaction_id,
                                final_energy_kwh=energy_kwh
                            )
                        
                        logging.info(f"Created PowerLog record for transaction {transaction_id}: power_kw={power_kw}, energy_kwh={energy_kwh}")
                except Exception as e:
                    logging.error(f"Failed to create PowerLog record for transaction {transaction_id}: {e}")

            logging.info(f"Logged {entries_logged} MeterValues for connector {connector_id}, transaction {transaction_id}")

        except Exception as e:
            logging.exception("Error logging MeterValues")

    def _write_condensed_json(self, data):
        """Writes condensed meter values to a JSON file."""
        try:
            with open(self.json_path, mode='w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            logging.info(f"Wrote condensed JSON to {self.json_path}")
        except Exception:
            logging.exception("Failed to write condensed JSON.")
