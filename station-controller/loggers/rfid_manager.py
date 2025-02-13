import csv
import logging
import os
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from constants import ACCEPTED_RFIDS_CSV, REJECTED_RFIDS_CSV
from file_manager import FileManager

logging.basicConfig(level=logging.INFO)

class RFIDManager(FileManager):
    """ Manages the RFID whitelist stored in a CSV file. """

    def __init__(self):
        self.accepted_rfids_path = self._ensure_file_exists(ACCEPTED_RFIDS_CSV)
        self.refused_rfids_path = self._ensure_file_exists(REJECTED_RFIDS_CSV)
        self._ensure_header(self.accepted_rfids_path, ["RFID", "Owner", "Last_Used"])
        self._ensure_header(self.refused_rfids_path, ["RFID", "Date_Refused"])
        self.rfid_whitelist = {}
        self.load_rfid_whitelist()
        self.start_file_watcher()

    def load_rfid_whitelist(self):
        """ Load authorized RFID tags from a CSV file. """
        rfid_tags = {}

        try:
            with open(self.accepted_rfids_path, newline='', encoding="utf-8") as file:
                reader = csv.reader(file)
                next(reader, None)  # Skip header
                for row in reader:
                    if len(row) >= 3:  # Ensure we have all required columns
                        rfid, owner, last_used = row
                        rfid_tags[rfid.strip().upper()] = {"owner": owner.strip(), "last_used": last_used.strip()}
            logging.info(f"Loaded {len(rfid_tags)} RFID tags from {self.accepted_rfids_path}")
        except Exception as e:
            logging.error(f"Error reading RFID whitelist: {e}")

        self.rfid_whitelist = rfid_tags

    def is_authorized(self, rfid_tag):
        """ Check if an RFID tag is authorized and update its last used timestamp. """
        rfid_tag = rfid_tag.strip().upper()
        if rfid_tag in self.rfid_whitelist:
            self.update_last_used(rfid_tag)
            return True
        
        self.log_refused_rfid(rfid_tag)  # Log refused access
        return False

    def add_rfid(self, rfid_tag, owner):
        """ Add a new RFID tag to the whitelist. """
        rfid_tag = rfid_tag.strip().upper()
        if rfid_tag in self.rfid_whitelist:
            logging.warning(f"RFID {rfid_tag} is already in the whitelist.")
            return False

        last_used = "Never"
        with open(self.accepted_rfids_path, 'a', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow([rfid_tag, owner, last_used])

        self.rfid_whitelist[rfid_tag] = {"owner": owner, "last_used": last_used}
        logging.info(f"Added RFID {rfid_tag} to the whitelist.")
        return True

    def update_last_used(self, rfid_tag):
        """ Update the last used timestamp of an RFID tag. """
        if rfid_tag not in self.rfid_whitelist:
            logging.warning(f"RFID {rfid_tag} not found in whitelist.")
            return False

        # Update the in-memory whitelist
        self.rfid_whitelist[rfid_tag]["last_used"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        # Read all records and update the last_used field
        updated_list = []
        with open(self.accepted_rfids_path, 'r', newline='', encoding="utf-8") as file:
            reader = csv.reader(file)
            for row in reader:
                if row and row[0].strip().upper() == rfid_tag:
                    row[2] = self.rfid_whitelist[rfid_tag]["last_used"]  # Update last_used field
                updated_list.append(row)

        # Rewrite the file with updated last_used timestamps
        with open(self.accepted_rfids_path, 'w', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerows(updated_list)

        logging.info(f"Updated last used timestamp for RFID {rfid_tag}.")
        return True

    def remove_rfid(self, rfid_tag):
        """ Remove an RFID tag from the whitelist. """
        rfid_tag = rfid_tag.strip().upper()
        if rfid_tag not in self.rfid_whitelist:
            logging.warning(f"RFID {rfid_tag} not found in whitelist.")
            return False

        # Read all records except the one to remove
        updated_list = []
        with open(self.accepted_rfids_path, 'r', newline='', encoding="utf-8") as file:
            reader = csv.reader(file)
            for row in reader:
                if row and row[0].strip().upper() != rfid_tag:
                    updated_list.append(row)

        # Rewrite the file without the removed tag
        with open(self.accepted_rfids_path, 'w', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerows(updated_list)

        del self.rfid_whitelist[rfid_tag]
        logging.info(f"Removed RFID {rfid_tag} from the whitelist.")
        return True

    def log_refused_rfid(self, rfid_tag):
        """ Log a refused RFID attempt in refused_rfids.csv. """
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with open(self.refused_rfids_path, 'a', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow([rfid_tag, timestamp])
        logging.warning(f"Unauthorized RFID {rfid_tag} attempted access on {timestamp}.")

    def start_file_watcher(self):
        """ Start a file watcher to reload RFID tags when the file changes. """
        event_handler = RFIDFileEventHandler(self)
        observer = Observer()
        observer.schedule(event_handler, path=os.path.dirname(self.accepted_rfids_path) or ".", recursive=False)
        observer.start()
        logging.info(f"Started watching {self.accepted_rfids_path} for changes.")

    def _ensure_header(self, file_path, header):
        """ Ensure the CSV file has the correct header. """
        if os.stat(file_path).st_size == 0:
            with open(file_path, 'w', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(header)

class RFIDFileEventHandler(FileSystemEventHandler):
    """ Watches the RFID list file and reloads when updated. """

    def __init__(self, rfid_manager):
        self.rfid_manager = rfid_manager

    def on_modified(self, event):
        if event.src_path.endswith(ACCEPTED_RFIDS_CSV):
            logging.info("RFID whitelist file updated. Reloading...")
            self.rfid_manager.load_rfid_whitelist()