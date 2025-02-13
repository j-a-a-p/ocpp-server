import serial
import logging
import time
from dsmr_parser import telegram_specifications
from dsmr_parser.parsers import TelegramParser
from dsmr_parser.clients.serial import SerialReader

logging.basicConfig(level=logging.INFO)

class P1Monitor:
    """ Reads power usage from the P1 smart meter via USB. """

    def __init__(self, usb_port="/dev/ttyUSB0", baudrate=115200):
        self.usb_port = usb_port
        self.baudrate = baudrate
        self.serial_reader = None

    def connect(self):
        """ Connect to the P1 meter via USB. """
        try:
            self.serial_reader = SerialReader(
                device=self.usb_port,
                serial_settings={
                    "baudrate": self.baudrate,
                    "bytesize": serial.EIGHTBITS,
                    "parity": serial.PARITY_NONE,
                    "stopbits": serial.STOPBITS_ONE,
                    "xonxoff": 0
                },
                telegram_specification=telegram_specifications.V5
            )
            logging.info(f"Connected to P1 meter on {self.usb_port}")
        except Exception as e:
            logging.error(f"Failed to connect to P1 meter: {e}")
            self.serial_reader = None

    def read_power_usage(self):
        """ Reads power consumption per phase. """
        if not self.serial_reader:
            logging.error("P1 meter not connected!")
            return

        try:
            for telegram in self.serial_reader.read():
                phase_1_current = telegram.P1_POWER_CURRENT_L1.value
                phase_2_current = telegram.P1_POWER_CURRENT_L2.value
                phase_3_current = telegram.P1_POWER_CURRENT_L3.value

                logging.info(f"Current usage - L1: {phase_1_current}A, L2: {phase_2_current}A, L3: {phase_3_current}A")
                time.sleep(1)  # Read every second

        except Exception as e:
            logging.error(f"Error reading P1 meter: {e}")

    def start_monitoring(self):
        """ Starts monitoring power usage in a loop. """
        self.connect()
        while True:
            self.read_power_usage()