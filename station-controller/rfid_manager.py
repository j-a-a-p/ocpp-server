import logging
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Card, Resident, ResidentStatus
from refused_card_service import RefusedCardService

logging.basicConfig(level=logging.INFO)

class RFIDManager:
    """ Manages the RFID authentication process. """

    def __init__(self):
        self.rfid_whitelist = set()

    def is_authorized(self, rfid_tag, station_id=None):
        """ Check if an RFID tag is authorized by querying the database. """
        logging.debug(f"Auth request for RFID: {rfid_tag}")
        
        # Clean the RFID tag
        rfid_tag = rfid_tag.strip().upper()
        
        try:
            db = SessionLocal()
            # Check if the card exists and is associated with an active resident
            card = db.query(Card).join(Resident).filter(
                Card.rfid == rfid_tag,
                Resident.status == ResidentStatus.ACTIVE
            ).first()
            
            if card:
                logging.info(f"Authorization successful for RFID {rfid_tag} - Resident: {card.resident.full_name}")
                return True
            else:
                logging.warning(f"Unauthorized RFID attempt: {rfid_tag} - Card not found or resident not active")
                # Log the refused card attempt if station_id is provided
                if station_id:
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
