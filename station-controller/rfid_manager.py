import csv
import logging
import os
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logging.basicConfig(level=logging.INFO)

RFID_CSV_FILE = "rfid_list.csv"

class RFIDManager:
    """ Manages the RFID whitelist stored in a CSV file. """

    def __init__(self, rfid_file=RFID_CSV_FILE, auto_reload=True):
        self.rfid_file = rfid_file
        self.rfid_whitelist = set()
        self.load_rfid_whitelist()

        if auto_reload:
            self.start_file_watcher()

    def load_rfid_whitelist(self):
        """ Load authorized RFID tags from a CSV file. Create if missing. """
        rfid_tags = set()
        if not os.path.exists(self.rfid_file):
            logging.warning(f"RFID whitelist file not found. Creating a new one: {self.rfid_file}")
            with open(self.rfid_file, 'w', newline='', encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow(["RFID", "Owner"])  # Optional: Add a header row
            return

        try:
            with open(self.rfid_file, newline='', encoding="utf-8") as file:
                reader = csv.reader(file)
                next(reader, None)  # Skip header if present
                for row in reader:
                    if row and row[0]:  # Ensure the row is not empty
                        rfid_tags.add(row[0].strip().upper())
            logging.info(f"Loaded {len(rfid_tags)} RFID tags from {self.rfid_file}")
        except Exception as e:
            logging.error(f"Error reading RFID whitelist: {e}")

        self.rfid_whitelist = rfid_tags

    def is_authorized(self, rfid_tag):
        """ Check if an RFID tag is authorized. """
        return rfid_tag.strip().upper() in self.rfid_whitelist

    def add_rfid(self, rfid_tag, owner="Unknown"):
        """ Add a new RFID tag to the whitelist. """
        rfid_tag = rfid_tag.strip().upper()
        if rfid_tag in self.rfid_whitelist:
            logging.warning(f"RFID {rfid_tag} is already in the whitelist.")
            return False

        with open(self.rfid_file, 'a', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow([rfid_tag, owner])
        
        self.rfid_whitelist.add(rfid_tag)
        logging.info(f"Added RFID {rfid_tag} to the whitelist.")
        return True

    def remove_rfid(self, rfid_tag):
        """ Remove an RFID tag from the whitelist. """
        rfid_tag = rfid_tag.strip().upper()
        if rfid_tag not in self.rfid_whitelist:
            logging.warning(f"RFID {rfid_tag} not found in whitelist.")
            return False

        # Read all records except the one to remove
        updated_list = []
        with open(self.rfid_file, 'r', newline='', encoding="utf-8") as file:
            reader = csv.reader(file)
            for row in reader:
                if row and row[0].strip().upper() != rfid_tag:
                    updated_list.append(row)

        # Rewrite the file without the removed tag
        with open(self.rfid_file, 'w', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerows(updated_list)

        self.rfid_whitelist.remove(rfid_tag)
        logging.info(f"Removed RFID {rfid_tag} from the whitelist.")
        return True

    def start_file_watcher(self):
        """ Start a file watcher to reload RFID tags when the file changes. """
        event_handler = RFIDFileEventHandler(self)
        observer = Observer()
        observer.schedule(event_handler, path=os.path.dirname(self.rfid_file) or ".", recursive=False)
        observer.start()
        logging.info(f"Started watching {self.rfid_file} for changes.")


class RFIDFileEventHandler(FileSystemEventHandler):
    """ Watches the RFID list file and reloads when updated. """

    def __init__(self, rfid_manager):
        self.rfid_manager = rfid_manager

    def on_modified(self, event):
        if event.src_path.endswith(RFID_CSV_FILE):
            logging.info("RFID whitelist file updated. Reloading...")
            self.rfid_manager.load_rfid_whitelist()