"""Charge transactions and power logs: what residents and the management portal read."""
from datetime import datetime, timedelta

from crud import calculate_power_log_costs
from models import ChargingCost, PowerLog

# The migrations start with a price of 0.30 per kWh.
DEFAULT_PRICE = 0.30


class TestMyTransactions:
    def test_needs_a_login(self, client):
        assert client.get("/charge-transactions/my-transactions").status_code == 401

    def test_no_cards_means_no_charges(self, user):
        assert user.get("/charge-transactions/my-transactions").json() == []

    def test_only_my_charges_newest_first_with_the_name_of_the_card(
        self, user, me, make_card, make_transaction, make_resident
    ):
        mine = make_card(me, "04AABBCC", "Tesla")
        theirs = make_card(make_resident(email="other@example.com"), "04DDEEFF", "Other car")
        first = make_transaction(mine, [(0, 7.0, 1.0)])
        make_transaction(theirs, [(0, 7.0, 1.0)])
        second = make_transaction(mine, [(0, 11.0, 2.0)], station_id="CP2")

        charges = user.get("/charge-transactions/my-transactions").json()

        assert [charge["id"] for charge in charges] == [second.id, first.id]
        assert charges[0]["card_name"] == "Tesla"
        assert charges[0]["station_id"] == "CP2"

    def test_power_logs_carry_the_cost_of_the_energy_since_the_previous_log(self, user, me, make_card, make_transaction):
        card = make_card(me)
        make_transaction(card, [(0, 7.0, 1.0), (5, 7.0, 3.0), (10, 7.0, 6.0)], final_energy_kwh=6.0)

        logs = user.get("/charge-transactions/my-transactions").json()[0]["power_logs"]

        assert [log["energy_kwh"] for log in logs] == [1.0, 3.0, 6.0]
        assert [round(log["delta_power_cost"], 4) for log in logs] == [0.30, 0.60, 0.90]
        assert {log["kwh_rate"] for log in logs} == {DEFAULT_PRICE}

    def test_pagination(self, user, me, make_card, make_transaction):
        card = make_card(me)
        for _ in range(3):
            make_transaction(card, [(0, 7.0, 1.0)])

        assert len(user.get("/charge-transactions/my-transactions", params={"limit": 2}).json()) == 2
        assert len(user.get("/charge-transactions/my-transactions", params={"skip": 2}).json()) == 1


class TestAllTransactionsForManagement:
    """What the management Charges page reads: every charge with the name of the resident."""

    def test_needs_a_login(self, client):
        assert client.get("/charge-transactions/all").status_code == 401

    def test_lists_every_charge_newest_first_with_the_resident_and_the_cost(
        self, user, me, make_card, make_transaction, make_resident
    ):
        other = make_resident(email="other@example.com", full_name="Other Person")
        older = make_transaction(make_card(me, "04AABBCC"), [(0, 7.0, 2.0)], started=datetime(2026, 11, 1, 10, 0))
        newer = make_transaction(make_card(other, "04DDEEFF"), [(0, 7.0, 1.0), (5, 7.0, 4.0)], started=datetime(2026, 11, 2, 10, 0))

        charges = user.get("/charge-transactions/all").json()

        assert [charge["id"] for charge in charges] == [newer.id, older.id]
        assert [charge["resident_name"] for charge in charges] == ["Other Person", "Me Myself"]
        assert charges[0]["created"] == "2026-11-02T10:00:00"
        assert charges[0]["final_energy_kwh"] == 4.0
        assert [round(log["delta_power_cost"], 4) for log in charges[0]["power_logs"]] == [0.30, 0.90]

    def test_a_charge_that_is_still_running_has_zero_energy(self, user, me, make_card, make_transaction):
        make_transaction(make_card(me), logs=[])

        assert user.get("/charge-transactions/all").json()[0]["final_energy_kwh"] == 0


class TestApiKeyEndpoints:
    def test_need_the_api_key(self, client):
        assert client.get("/charge-transactions/").status_code == 403
        assert client.get("/charge-transactions/resident/1").status_code == 403

    def test_all_transactions(self, client, api_key_headers, me, make_card, make_transaction):
        make_transaction(make_card(me), [(0, 7.0, 1.0)], final_energy_kwh=1.0)

        charges = client.get("/charge-transactions/", headers=api_key_headers).json()

        assert len(charges) == 1
        assert charges[0]["final_energy_kwh"] == 1.0
        assert len(charges[0]["power_logs"]) == 1

    def test_transactions_of_a_resident(self, client, api_key_headers, me, make_card, make_transaction, make_resident):
        other = make_resident(email="other@example.com")
        make_transaction(make_card(me, "04AABBCC"), [(0, 7.0, 1.0)])
        make_transaction(make_card(other, "04DDEEFF"), [(0, 7.0, 1.0)])

        charges = client.get(f"/charge-transactions/resident/{me.id}", headers=api_key_headers).json()

        assert [charge["rfid"] for charge in charges] == ["04AABBCC"]

    def test_resident_without_cards(self, client, api_key_headers, me):
        assert client.get(f"/charge-transactions/resident/{me.id}", headers=api_key_headers).json() == []

    def test_unknown_resident(self, client, api_key_headers):
        assert client.get("/charge-transactions/resident/9999", headers=api_key_headers).status_code == 404


class TestPowerLogsEndpoint:
    def test_needs_a_login(self, client):
        assert client.get("/power-logs/").status_code == 401

    def test_lists_the_newest_log_first(self, user, me, make_card, make_transaction):
        make_transaction(make_card(me), [(0, 5.0, 1.0), (5, 6.0, 2.0), (10, 7.0, 3.0)])

        logs = user.get("/power-logs/").json()

        assert [log["energy_kwh"] for log in logs] == [3.0, 2.0, 1.0]
        assert set(logs[0]) >= {"id", "charge_transaction_id", "created", "power_kw", "energy_kwh"}

    def test_skip_and_limit(self, user, me, make_card, make_transaction):
        make_transaction(make_card(me), [(0, 5.0, 1.0), (5, 6.0, 2.0), (10, 7.0, 3.0)])

        logs = user.get("/power-logs/", params={"skip": 1, "limit": 1}).json()

        assert [log["energy_kwh"] for log in logs] == [2.0]


class TestCostCalculation:
    """crud.calculate_power_log_costs, the rule behind every price shown in the portals."""

    def logs(self, *readings, day=None):
        start = day or datetime(2026, 11, 1, 12, 0)
        return [
            PowerLog(id=index + 1, created=start + timedelta(minutes=5 * index), power_kw=7.0, energy_kwh=energy)
            for index, energy in enumerate(readings)
        ]

    def test_the_first_log_counts_in_full_then_only_the_increase(self, db):
        logs = calculate_power_log_costs(db, self.logs(2.0, 5.0, 5.5))

        assert [round(log.delta_power_cost, 4) for log in logs] == [0.60, 0.90, 0.15]

    def test_logs_are_ordered_by_time_before_the_increase_is_taken(self, db):
        shuffled = list(reversed(self.logs(2.0, 5.0)))

        calculate_power_log_costs(db, shuffled)

        by_energy = {log.energy_kwh: log.delta_power_cost for log in shuffled}
        assert round(by_energy[2.0], 4) == 0.60
        assert round(by_energy[5.0], 4) == 0.90

    def test_a_meter_that_goes_backwards_costs_nothing(self, db):
        logs = calculate_power_log_costs(db, self.logs(5.0, 4.0, 6.0))

        assert [round(log.delta_power_cost, 4) for log in logs] == [1.50, 0.0, 0.60]

    def test_no_logs(self, db):
        assert calculate_power_log_costs(db, []) == []

    def test_a_price_that_has_ended_does_not_apply_after_its_end_date(self, db):
        db.query(ChargingCost).delete()
        db.add(ChargingCost(kwh_price=0.20, end_date=datetime(2026, 11, 10).date(), created=datetime(2026, 1, 1)))
        db.commit()

        before = calculate_power_log_costs(db, self.logs(1.0, day=datetime(2026, 11, 5, 12, 0)))
        after = calculate_power_log_costs(db, self.logs(1.0, day=datetime(2026, 11, 20, 12, 0)))

        assert (before[0].kwh_rate, round(before[0].delta_power_cost, 4)) == (0.20, 0.20)
        assert (after[0].kwh_rate, after[0].delta_power_cost) == (0.0, 0.0)

    def test_the_newest_price_applies_to_earlier_charges_too(self, db):
        # Known limitation: prices have an end date but no start date, and the price without an end
        # date is also found for days before it was introduced. After a price change, old charges are
        # shown at the new price. Change this test together with the fix.
        db.query(ChargingCost).delete()
        db.add(ChargingCost(kwh_price=0.20, end_date=datetime(2026, 11, 10).date(), created=datetime(2026, 1, 1)))
        db.add(ChargingCost(kwh_price=0.50, end_date=None, created=datetime(2026, 11, 10)))
        db.commit()

        old_charge = calculate_power_log_costs(db, self.logs(1.0, day=datetime(2026, 11, 5, 12, 0)))

        assert old_charge[0].kwh_rate == 0.50

    def test_no_price_known_means_no_cost(self, db):
        db.query(ChargingCost).delete()
        db.commit()

        logs = calculate_power_log_costs(db, self.logs(3.0))

        assert (logs[0].kwh_rate, logs[0].delta_power_cost) == (0.0, 0.0)
