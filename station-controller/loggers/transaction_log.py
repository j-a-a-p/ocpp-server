import csv
import os
import logging
from constants import TRANSACTIONS_CSV
from loggers.file_manager import FileManager

class TransactionLog(FileManager):
    """Logs meter values to a CSV file."""

    def __init__(self, charge_point_id):
        self.file_path = self._ensure_file_exists(TRANSACTIONS_CSV)
        self.charge_point_id = charge_point_id
        self._ensure_file_exists()
        self._ensure_header()

    def log_transaction(self, timestamp, connector_id, transaction_id, id_tag, meter_start, meter_stop, reason):
        """Logs meter values to the CSV file."""
        try:
            with open(self.file_path, mode='a', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow([timestamp, self.charge_point_id, connector_id, transaction_id, id_tag, meter_start, meter_stop, reason])
                logging.debug(f"Transaction logged: {transaction_id}, Connector: {connector_id}, ID Tag: {id_tag}, Meter: {meter_start}/{meter_stop}, Timestamp: {timestamp}")
        except Exception as e:
            logging.error(f"Error logging MeterValues: {e}")

    def _ensure_header(self):
        """Ensure CSV has a header row."""
        if os.stat(self.csv_file).st_size == 0:
            with open(self.csv_file, "w", newline="", encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(["timestamp", "charge_point_id", "connector_id", "transaction_id", "tag_id", "meter_start", "meter_stop", "reason"])
