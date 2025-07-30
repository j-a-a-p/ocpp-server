import csv
import os
import logging
import json
from power_log_service import PowerLogService

METER_VALUES_CSV = "/var/www/html/meter_values.csv"
METER_VALUES_JSON = "/var/www/html/meter_values.json"

class MeterValuesManager:
    """Manages logging of meter values to a CSV and condensed JSON file."""

    def __init__(self, file_path=METER_VALUES_CSV, json_path=METER_VALUES_JSON):
        self.file_path = file_path
        self.json_path = json_path
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Ensure the CSV file exists with the correct header."""
        if not os.path.exists(self.file_path):
            with open(self.file_path, mode='w', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow([
                    "timestamp", "transactionId", "measurand", "phase", "unit", "value"
                ])
            logging.info(f"Created new meter values log: {self.file_path}")
            
    def log_meter_values(self, connector_id, transaction_id, meter_values):
        """Logs meter values to the CSV file and condensed JSON file."""
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
                "context": "",
                "data": {}
            }
            
            # Variables to track power and energy values for PowerLog
            power_kw = None
            energy_kwh = None

            with open(self.file_path, mode='a', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)

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

                        # Write to CSV
                        writer.writerow([
                            timestamp, transaction_id, measurand, phase, unit, value
                        ])
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

            self._write_condensed_json(condensed_data)
            
            # Create PowerLog record if we have power or energy data
            if power_kw is not None or energy_kwh is not None:
                try:
                    # Use 0.0 as default if values are None
                    power_kw = power_kw if power_kw is not None else 0.0
                    energy_kwh = energy_kwh if energy_kwh is not None else 0.0
                    
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
