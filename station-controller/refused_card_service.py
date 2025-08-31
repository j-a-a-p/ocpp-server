from models import RefusedCard
from database import SessionLocal

class RefusedCardService:
    @staticmethod
    def create_refused_card(station_id: str, rfid: str) -> RefusedCard:
        """Create a new refused card entry in the database."""
        db = SessionLocal()
        try:
            refused_card = RefusedCard(
                station_id=station_id,
                rfid=rfid
            )
            db.add(refused_card)
            db.commit()
            db.refresh(refused_card)
            return refused_card
        finally:
            db.close()
