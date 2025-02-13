import csv
import os
import logging
from constants import METER_VALUES_CSV
from loggers.file_manager import FileManager

class MeterValuesLog(FileManager):
    """Logs meter values to a CSV file."""

    def __init__(self):
        self.file_path = self._ensure_file_exists(METER_VALUES_CSV)
        self._ensure_file_exists()
        self._ensure_header()

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

    def _ensure_header(self):
        """Ensure CSV has a header row."""
        if os.stat(self.csv_file).st_size == 0:
            with open(self.csv_file, "w", newline="", encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(["timestamp", "connectorId", "transactionId", "measurand", "phase", "unit", "value", "context"])
