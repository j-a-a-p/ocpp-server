"""The OCPP messages a charger sends, handled one at a time."""
from datetime import timedelta
import json

import pytest

import charge_point
from charge_point import ChargePoint
from conftest import add_card
from models import Card, ChargeTransaction, Household, PowerLog, RefusedCard, Resident, ResidentStatus
from rfid_manager import local_today


def status_of(result) -> str:
    status = result.id_tag_info["status"]
    return str(getattr(status, "value", status))


@pytest.fixture
def cp(meter_file):
    return ChargePoint("CP1", websocket=None)


def meter_value(power_kw=None, energy_kwh=None, timestamp="2026-11-22T08:00:00Z", extra=()):
    sampled = list(extra)
    if power_kw is not None:
        sampled.append({"value": str(power_kw), "measurand": "Power.Active.Import", "unit": "kW"})
    if energy_kwh is not None:
        sampled.append({"value": str(energy_kwh), "measurand": "Energy.Active.Import.Register", "unit": "kWh"})
    return [{"timestamp": timestamp, "sampled_value": sampled}]


class TestBootAndHeartbeat:
    async def test_boot_is_accepted_with_a_thirty_second_interval(self, cp):
        result = await cp.on_boot_notification(
            charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123",
        )

        assert str(result.status.value) == "Accepted"
        assert result.interval == 30
        assert result.current_time

    async def test_the_charger_is_known_by_its_serial_number_after_boot(self, cp):
        await cp.on_boot_notification(
            charge_point_model="Wallbox", charge_point_vendor="ACME", charge_point_serial_number="SER123",
        )

        assert cp.id == "SER123"

    async def test_without_a_serial_number_the_connection_name_stays(self, cp):
        await cp.on_boot_notification(charge_point_model="Wallbox", charge_point_vendor="ACME")

        assert cp.id == "CP1"

    async def test_heartbeat_returns_the_time(self, cp):
        assert (await cp.on_heartbeat()).current_time


class TestAuthorize:
    async def test_card_of_an_active_resident_is_accepted(self, cp, resident_with_card):
        assert status_of(await cp.on_authorize(id_tag="04AABBCC")) == "Accepted"

    async def test_the_card_number_is_cleaned_up_before_the_lookup(self, cp, resident_with_card):
        assert status_of(await cp.on_authorize(id_tag="  04aabbcc ")) == "Accepted"

    async def test_unknown_card_is_invalid(self, cp):
        assert status_of(await cp.on_authorize(id_tag="DEADBEEF")) == "Invalid"

    async def test_card_of_a_resident_who_is_not_active_is_invalid(self, cp, db):
        invited = Resident(email="new@example.com", full_name="New", status=ResidentStatus.INVITED)
        db.add(invited)
        db.commit()
        add_card(db, "04112233", invited)

        assert status_of(await cp.on_authorize(id_tag="04112233")) == "Invalid"

    async def test_card_of_a_manager_who_is_not_a_resident_is_invalid(self, cp, db):
        manager = Resident(email="boss@example.com", full_name="Boss", status=ResidentStatus.ACTIVE, roles="manager")
        db.add(manager)
        db.commit()
        add_card(db, "04112233", manager)

        assert status_of(await cp.on_authorize(id_tag="04112233")) == "Invalid"

    async def test_card_of_a_manager_who_is_also_a_resident_is_accepted(self, cp, db):
        household = Household()
        db.add(household)
        db.flush()
        both = Resident(email="both@example.com", full_name="Both", status=ResidentStatus.ACTIVE, roles="manager,resident", household_id=household.id)
        db.add(both)
        db.commit()
        add_card(db, "04112233", both)

        assert status_of(await cp.on_authorize(id_tag="04112233")) == "Accepted"

    async def test_card_before_residency_start_date_is_invalid(self, cp, db):
        household = Household(start_date=local_today() + timedelta(days=1))
        db.add(household)
        db.flush()
        upcoming = Resident(email="upcoming@example.com", full_name="Upcoming", status=ResidentStatus.ACTIVE, roles="resident", household_id=household.id)
        db.add(upcoming)
        db.commit()
        add_card(db, "04UP0001", upcoming)

        assert status_of(await cp.on_authorize(id_tag="04UP0001")) == "Invalid"

    async def test_card_on_residency_end_date_is_still_accepted(self, cp, db):
        today = local_today()
        household = Household(start_date=today - timedelta(days=30), end_date=today)
        db.add(household)
        db.flush()
        ending = Resident(email="ending@example.com", full_name="Ending", status=ResidentStatus.ACTIVE, roles="resident", household_id=household.id)
        db.add(ending)
        db.commit()
        add_card(db, "04EN0001", ending)

        assert status_of(await cp.on_authorize(id_tag="04EN0001")) == "Accepted"

    async def test_card_after_residency_end_date_is_invalid(self, cp, db):
        today = local_today()
        household = Household(start_date=today - timedelta(days=30), end_date=today - timedelta(days=1))
        db.add(household)
        db.flush()
        ended = Resident(email="ended@example.com", full_name="Ended", status=ResidentStatus.ACTIVE, roles="resident", household_id=household.id)
        db.add(ended)
        db.commit()
        add_card(db, "04EX0001", ended)

        assert status_of(await cp.on_authorize(id_tag="04EX0001")) == "Invalid"

    async def test_a_card_that_a_manager_switched_off_is_invalid(self, cp, db, resident_with_card):
        db.query(Card).filter_by(rfid="04AABBCC").update({"enabled": False})
        db.commit()

        assert status_of(await cp.on_authorize(id_tag="04AABBCC")) == "Invalid"

    async def test_a_card_that_is_switched_off_cannot_start_a_charge(self, cp, db, resident_with_card):
        db.query(Card).filter_by(rfid="04AABBCC").update({"enabled": False})
        db.commit()

        result = await cp.on_start_transaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="t")

        assert status_of(result) == "Invalid"
        assert db.query(ChargeTransaction).count() == 0

    async def test_the_other_cards_of_the_same_resident_keep_working(self, cp, db, resident_with_card):
        add_card(db, "04DDEEFF", db.query(Resident).first())
        db.query(Card).filter_by(rfid="04AABBCC").update({"enabled": False})
        db.commit()

        assert status_of(await cp.on_authorize(id_tag="04DDEEFF")) == "Accepted"

    async def test_a_role_that_only_contains_the_word_resident_does_not_count(self, cp, db):
        other = Resident(email="other@example.com", full_name="Other", status=ResidentStatus.ACTIVE, roles="non_resident")
        db.add(other)
        db.commit()
        add_card(db, "04112233", other)

        assert status_of(await cp.on_authorize(id_tag="04112233")) == "Invalid"

    async def test_unknown_card_is_remembered_with_the_station(self, cp, db):
        await cp.on_authorize(id_tag="DEADBEEF")

        # The card is recorded by both the RFID check and the handler, so there can be more than one row.
        refused = db.query(RefusedCard).all()
        assert refused
        assert {(row.rfid, row.station_id) for row in refused} == {("DEADBEEF", "CP1")}

    async def test_accepted_card_is_not_recorded_as_refused(self, cp, db, resident_with_card):
        await cp.on_authorize(id_tag="04AABBCC")

        assert db.query(RefusedCard).count() == 0


class TestTransactions:
    async def test_start_stores_a_transaction_and_returns_its_id(self, cp, db, resident_with_card):
        result = await cp.on_start_transaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="2026-11-22T08:00:00Z")

        transaction = db.query(ChargeTransaction).one()
        assert result.transaction_id == transaction.id
        assert (transaction.station_id, transaction.rfid) == ("CP1", "04AABBCC")
        assert status_of(result) == "Accepted"

    async def test_a_card_that_is_not_known_cannot_start_a_charge(self, cp, db):
        result = await cp.on_start_transaction(connector_id=1, id_tag="DEADBEEF", meter_start=0, timestamp="t")

        assert status_of(result) == "Invalid"
        assert result.transaction_id == 0
        assert db.query(ChargeTransaction).count() == 0
        assert {row.rfid for row in db.query(RefusedCard)} == {"DEADBEEF"}

    async def test_a_card_of_a_resident_who_is_not_active_cannot_start_a_charge(self, cp, db):
        invited = Resident(email="new@example.com", full_name="New", status=ResidentStatus.INVITED)
        db.add(invited)
        db.commit()
        add_card(db, "04112233", invited)

        result = await cp.on_start_transaction(connector_id=1, id_tag="04112233", meter_start=0, timestamp="t")

        assert status_of(result) == "Invalid"
        assert db.query(ChargeTransaction).count() == 0

    async def test_the_card_number_is_stored_in_the_form_the_lookup_uses(self, cp, db, resident_with_card):
        result = await cp.on_start_transaction(connector_id=1, id_tag=" 04aabbcc ", meter_start=0, timestamp="t")

        assert status_of(result) == "Accepted"
        assert db.query(ChargeTransaction).one().rfid == "04AABBCC"

    async def test_a_failed_database_write_refuses_the_charge_instead_of_crashing(self, cp, db, resident_with_card, monkeypatch):
        def broken(**_):
            raise RuntimeError("database is locked")

        monkeypatch.setattr(charge_point.TransactionService, "create_transaction", staticmethod(broken))

        result = await cp.on_start_transaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="t")

        assert status_of(result) == "Invalid"
        assert result.transaction_id == 0

    async def test_every_start_is_a_new_transaction(self, cp, db, resident_with_card):
        first = await cp.on_start_transaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="t")
        second = await cp.on_start_transaction(connector_id=1, id_tag="04AABBCC", meter_start=0, timestamp="t")

        assert first.transaction_id != second.transaction_id

    async def test_stop_is_accepted(self, cp):
        result = await cp.on_stop_transaction(transaction_id=1, id_tag="04AABBCC", meter_stop=5000, timestamp="t")

        assert status_of(result) == "Accepted"

    async def test_stop_without_a_card_is_accepted(self, cp):
        # idTag is optional in OCPP 1.6 StopTransaction, for example when the car stops the charge.
        result = await cp.on_stop_transaction(transaction_id=1, meter_stop=5000, timestamp="t")

        assert status_of(result) == "Accepted"

    async def test_status_notification_is_acknowledged(self, cp):
        result = await cp.on_status_notification(connector_id=1, error_code="NoError", status="Charging")

        assert result is not None


class TestMeterValues:
    @pytest.fixture
    def transaction_id(self, db, resident_with_card):
        transaction = ChargeTransaction(station_id="CP1", rfid="04AABBCC")
        db.add(transaction)
        db.commit()
        return transaction.id

    async def test_power_and_energy_become_a_power_log_and_the_final_energy(self, cp, db, transaction_id):
        await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(7.2, 3.5))

        log = db.query(PowerLog).one()
        assert (log.charge_transaction_id, log.power_kw, log.energy_kwh) == (transaction_id, 7.2, 3.5)
        assert db.get(ChargeTransaction, transaction_id).final_energy_kwh == 3.5

    async def test_the_final_energy_follows_the_latest_reading(self, cp, db, transaction_id):
        for power, energy in ((7.0, 1.0), (7.1, 2.5), (7.2, 4.0)):
            await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(power, energy))

        assert db.query(PowerLog).count() == 3
        db.expire_all()
        assert db.get(ChargeTransaction, transaction_id).final_energy_kwh == 4.0

    async def test_the_final_energy_never_drops_when_the_charger_counter_drops(self, cp, db, transaction_id):
        # A charger counter that restarts after a pause: 4.0 kWh, then 0.5, then it counts on to 1.5.
        for power, energy in ((7.0, 1.0), (7.1, 2.5), (7.2, 4.0), (7.0, 0.5), (7.0, 1.5)):
            await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(power, energy))

        db.expire_all()
        # 4.0 before the drop, nothing for the drop itself, then 1.0 more.
        assert db.get(ChargeTransaction, transaction_id).final_energy_kwh == 5.0
        # The readings themselves are kept as the charger sent them.
        assert [log.energy_kwh for log in db.query(PowerLog).order_by(PowerLog.id)] == [1.0, 2.5, 4.0, 0.5, 1.5]

    async def test_a_last_reading_below_the_total_does_not_lower_the_final_energy(self, cp, db, transaction_id):
        for power, energy in ((20.0, 11.0), (20.0, 12.0), (0.0, 2.2)):
            await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(power, energy))

        db.expire_all()
        assert db.get(ChargeTransaction, transaction_id).final_energy_kwh == 12.0

    async def test_a_reading_of_zero_energy_is_not_stored(self, cp, db, transaction_id):
        await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(0.0, 0.0))

        assert db.query(PowerLog).count() == 0

    async def test_a_reading_without_energy_is_not_stored(self, cp, db, transaction_id):
        await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=meter_value(power_kw=7.2))

        assert db.query(PowerLog).count() == 0

    async def test_the_latest_reading_is_published_as_condensed_json(self, cp, meter_file, transaction_id):
        phases = [
            {"value": "10.5", "measurand": "Current.Import", "phase": "L1", "unit": "A"},
            {"value": "10.4", "measurand": "Current.Import", "phase": "L2", "unit": "A"},
        ]

        await cp.on_meter_values(
            connector_id=1, transaction_id=transaction_id,
            meter_value=meter_value(7.2, 3.5, timestamp="2026-11-22T08:01:02Z", extra=phases),
        )

        published = json.loads(meter_file.read_text())
        assert published["timestamp"] == "2026-11-22T08:01:02Z"
        assert published["connectorId"] == 1
        assert published["transactionId"] == transaction_id
        assert published["data"] == {
            "Current.Import.L1": 10.5, "Current.Import.L2": 10.4,
            "Power.Active.Import": 7.2, "Energy.Active.Import.Register": 3.5,
        }
        assert published["chargingProfile"]["name"] == "max_power"

    async def test_an_empty_message_changes_nothing(self, cp, db, meter_file, transaction_id):
        result = await cp.on_meter_values(connector_id=1, transaction_id=transaction_id, meter_value=[])

        assert result is not None
        assert db.query(PowerLog).count() == 0
        assert not meter_file.exists()

    async def test_a_reading_for_an_unknown_transaction_does_not_crash(self, cp, db):
        # Foreign keys are not enforced by the controller's connection, so the log is stored anyway.
        result = await cp.on_meter_values(connector_id=1, transaction_id=999, meter_value=meter_value(7.0, 1.0))

        assert result is not None
