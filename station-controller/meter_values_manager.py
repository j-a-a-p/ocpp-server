import csv
import os
import logging

METER_VALUES_CSV = "meter_values.csv"

class MeterValuesManager:
    """Manages logging of meter values to a CSV file."""

    def __init__(self, file_path=METER_VALUES_CSV):
        self.file_path = file_path
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Ensure the CSV file exists with the correct header."""
        if not os.path.exists(self.file_path):
            with open(self.file_path, mode='w', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(["timestamp", "connectorId", "transactionId", "measurand", "phase", "unit", "value", "context"])
            logging.info(f"Created new meter values log: {self.file_path}")

    def log_meter_values(self, connector_id, transaction_id, meter_values):
        """Logs meter values to the CSV file."""
        try:
            with open(self.file_path, mode='a', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)

                entries_logged = 0
                for meter_value in meter_values:
                    timestamp = meter_value.get("timestamp")
                    sampled_values = meter_value.get("sampledValue", [])

                    for sample in sampled_values:
                        measurand = sample.get("measurand", "Unknown")
                        phase = sample.get("phase", "")  # Keep empty instead of "N/A"
                        unit = sample.get("unit", "")
                        value = sample.get("value", "0")
                        context = sample.get("context", "")

                        writer.writerow([timestamp, connector_id, transaction_id, measurand, phase, unit, value, context])
                        entries_logged += 1

            logging.info(f"Logged {entries_logged} MeterValues for connector {connector_id}, transaction {transaction_id}")

        except Exception as e:
            logging.error(f"Error logging MeterValues: {e}")