import os
import platform
import configparser

APP_NAME = "charge-apt"

# Determine OS and set config file path
if platform.system() == "Darwin":  # macOS
    CONFIG_FILE = os.path.expanduser(f"~/.config/{APP_NAME}/configuration.ini")
elif platform.system() == "Linux":
    CONFIG_FILE = "/etc/{APP_NAME}/configuration.ini"
else:
    raise RuntimeError("Unsupported OS")

config = configparser.ConfigParser()
config.read(CONFIG_FILE)

def load_secret(key):
    """Loads secret values from a key-value configuration file."""
    try:
        with open(CONFIG_FILE) as f:
            for line in f:
                k, v = line.strip().split("=", 1)
                if k == key:
                    return v
    except Exception as e:
        print(f"Error loading secret {key}: {e}")
        return None

DATA_DIRECTORY = "charge-cloud"
DB_FILE = "cloud.db"
SES_ACCESS_KEY = config.get("SimpleEmailService", "SES_ACCESS_KEY", fallback=None)
SES_SECRET_KEY = config.get("SimpleEmailService", "SES_SECRET_KEY", fallback=None)
AWS_REGION = "eu-central-1"

JWT_SECRET = config.get("Cloud", "JWT_SECRET", fallback=None)
JWT_EXPIRATION_DAYS = 180

INVITE_URL = config.get("ResidentUI", "INVITE_URL", fallback=None)
INVITE_EXPIRATION_DAYS = 180
