import csv
import os
import logging

import csv
import os
import logging
import json

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
                    "timestamp", "connectorId", "transactionId",
                    "measurand", "phase", "unit", "value", "context"
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
                        context = sample.get("context", "")

                        # Write to CSV
                        writer.writerow([
                            timestamp, connector_id, transaction_id,
                            measurand, phase, unit, value, context
                        ])
                        entries_logged += 1

                        # Condense to JSON
                        key = measurand if not phase else f"{measurand}.{phase}"
                        condensed_data["data"][key] = float(value)
                        condensed_data["timestamp"] = timestamp
                        condensed_data["context"] = context

            self._write_condensed_json(condensed_data)

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
