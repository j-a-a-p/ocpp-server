from sqlalchemy.orm import Session
from models import PowerLog, ChargeTransaction
from database import SessionLocal

class PowerLogService:
    @staticmethod
    def create_power_log(charge_transaction_id: int, power_kw: float, energy_kwh: float) -> PowerLog:
        """Create a new power log entry in the database."""
        db = SessionLocal()
        try:
            power_log = PowerLog(
                charge_transaction_id=charge_transaction_id,
                power_kw=power_kw,
                energy_kwh=energy_kwh
            )
            db.add(power_log)
            db.commit()
            db.refresh(power_log)
            return power_log
        finally:
            db.close()
    
    @staticmethod
    def record_reading(transaction_id: int, power_kw: float, energy_kwh: float) -> PowerLog:
        """Store a reading and add the energy since the previous reading to the transaction's total.

        The charger reports a running counter, but that counter drops now and then (it restarts when a
        charge is paused and resumed, and the last reading of a session can be a different counter).
        A drop is therefore a step that adds nothing: the total only ever grows, and the next reading
        is compared with the one after the drop.
        """
        db = SessionLocal()
        try:
            previous = (
                db.query(PowerLog)
                .filter(PowerLog.charge_transaction_id == transaction_id)
                .order_by(PowerLog.id.desc())
                .first()
            )
            added = energy_kwh if previous is None else max(0.0, energy_kwh - previous.energy_kwh)

            power_log = PowerLog(charge_transaction_id=transaction_id, power_kw=power_kw, energy_kwh=energy_kwh)
            db.add(power_log)
            transaction = db.query(ChargeTransaction).filter(ChargeTransaction.id == transaction_id).first()
            if transaction:
                transaction.final_energy_kwh = round((transaction.final_energy_kwh or 0.0) + added, 6)
            db.commit()
            db.refresh(power_log)
            return power_log
        finally:
            db.close()

    @staticmethod
    def update_transaction_final_energy(transaction_id: int, final_energy_kwh: float) -> ChargeTransaction:
        """Update the final_energy_kwh field of a charge transaction."""
        db = SessionLocal()
        try:
            transaction = db.query(ChargeTransaction).filter(ChargeTransaction.id == transaction_id).first()
            if transaction:
                transaction.final_energy_kwh = final_energy_kwh
                db.commit()
                db.refresh(transaction)
            return transaction
        finally:
            db.close()
