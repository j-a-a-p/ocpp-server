from datetime import datetime
from zoneinfo import ZoneInfo
import logging
from sqlalchemy import or_
from database import SessionLocal
from models import Card, Household, Resident, ResidentStatus
from refused_card_service import RefusedCardService

logging.basicConfig(level=logging.INFO)

RESIDENT_ROLE = "resident"
LOCAL_TIMEZONE = ZoneInfo("Europe/Amsterdam")


def local_today():
    """Today's date in the Netherlands, used for residency start/end date checks."""
    return datetime.now(LOCAL_TIMEZONE).date()


class RFIDManager:
    """ Manages the RFID authentication process. """

    def __init__(self):
        self.rfid_whitelist = set()

    def is_authorized(self, rfid_tag, station_id=None):
        """ Check if an RFID tag is authorized by querying the database. """
        logging.debug(f"Auth request for RFID: {rfid_tag}")

        # Clean the RFID tag
        rfid_tag = rfid_tag.strip().upper()
        today = local_today()

        try:
            db = SessionLocal()
            # Check if the card exists, is enabled, and belongs to an active resident whose
            # household residency covers today (start_date <= today <= end_date).
            card = (
                db.query(Card)
                .join(Resident)
                .join(Household, Resident.household_id == Household.id)
                .filter(
                    Card.rfid == rfid_tag,
                    Card.enabled.is_(True),
                    Resident.status == ResidentStatus.ACTIVE,
                    Resident.has_role_sql(RESIDENT_ROLE),
                    or_(Household.start_date.is_(None), Household.start_date <= today),
                    or_(Household.end_date.is_(None), Household.end_date >= today),
                )
                .first()
            )

            if card:
                logging.info(f"Authorization successful for RFID {rfid_tag} - Resident: {card.resident.full_name}")
                return True
            else:
                logging.warning(f"Unauthorized RFID attempt: {rfid_tag} - Card not found or residency not active")
                # Only log as refused if the card is genuinely unknown (known cards disabled or outside residency
                # should not be offered for claiming).
                if station_id and not db.query(Card).filter(Card.rfid == rfid_tag).first():
                    try:
                        RefusedCardService.create_refused_card(station_id, rfid_tag)
                    except Exception as e:
                        logging.error(f"Failed to log refused card: {str(e)}")
                return False

        except Exception as e:
            logging.error(f"Database error during authorization check for RFID {rfid_tag}: {str(e)}")
            return False
        finally:
            db.close()
