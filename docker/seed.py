"""Fills the local database with the users, cards and some history from dev-data.json.

Runs after the Flyway migrations. Safe to run again: users and cards that exist
are left alone, and the charging history is only added to an empty database, so
the data you create or that the simulated chargers record is never touched.
"""
import json
import math
import random
import sqlite3
from datetime import datetime, timedelta

DB_PATH = "/home/ubuntu/ocpp-data/cloud.db"
DEV_DATA_PATH = "/app/dev-data.json"
LOG_INTERVAL_MINUTES = 10


def timestamp(moment: datetime) -> str:
    # Same format SQLite's CURRENT_TIMESTAMP gives, which is what production stores (UTC).
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def power_at(fraction: float, max_kw: float, rng: random.Random) -> float:
    """Charging curve: quick ramp up, a plateau, then tapering off at the end."""
    if fraction < 0.05:
        level = 0.3 + 0.7 * (fraction / 0.05)
    elif fraction > 0.75:
        level = 1.0 - 0.6 * ((fraction - 0.75) / 0.25)
    else:
        level = 1.0
    return round(max_kw * level * rng.uniform(0.97, 1.0), 2)


def seed_residents(cur: sqlite3.Cursor, data: dict) -> list[tuple[str, str]]:
    """Returns (rfid, name) of every card of the seeded residents."""
    cards = []
    for resident in data["residents"]:
        existing = cur.execute("SELECT id FROM residents WHERE email = ?", (resident["email"],)).fetchone()
        if existing:
            resident_id = existing[0]
        else:
            roles = sorted(resident["roles"])
            household_id = None
            is_main_member = 0
            if "household_head" in resident:
                # A household member: the resident who invited them is listed earlier.
                row = cur.execute(
                    "SELECT household_id FROM residents WHERE email = ?", (resident["household_head"],)
                ).fetchone()
                household_id = row[0] if row else None
            elif "resident" in roles:
                address = resident.get("address", {})
                cur.execute(
                    "INSERT INTO households (street_name, house_number, house_number_suffix, zip_code, city, start_date, end_date)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        address.get("street_name"), address.get("house_number"), address.get("house_number_suffix"),
                        address.get("zip_code"), address.get("city"),
                        resident.get("residency_start_date"), resident.get("residency_end_date"),
                    ),
                )
                household_id = cur.lastrowid
                is_main_member = 1

            cur.execute(
                "INSERT INTO residents (full_name, email, status, roles, household_id, is_main_member)"
                " VALUES (?, ?, 'ACTIVE', ?, ?, ?)",
                (
                    resident["full_name"], resident["email"], ",".join(roles),
                    household_id, is_main_member,
                ),
            )
            resident_id = cur.lastrowid
        for card in resident.get("cards", []):
            rfid = card["rfid"].strip().upper()
            cur.execute(
                "INSERT OR IGNORE INTO cards (rfid, name, resident_id) VALUES (?, ?, ?)",
                (rfid, card["name"], resident_id),
            )
            cards.append((rfid, card["name"]))
    return cards


def seed_price(cur: sqlite3.Cursor, data: dict) -> None:
    if cur.execute("SELECT COUNT(*) FROM charging_costs").fetchone()[0] == 0:
        cur.execute(
            "INSERT INTO charging_costs (kwh_price, kwh_price_dal, end_date, created) VALUES (?, ?, NULL, ?)",
            (data["price_per_kwh"], data["price_per_kwh_dal"], timestamp(datetime.utcnow() - timedelta(days=60))),
        )


def seed_history(cur: sqlite3.Cursor, data: dict, cards: list[tuple[str, str]]) -> int:
    if cur.execute("SELECT COUNT(*) FROM charge_transactions").fetchone()[0] > 0:
        return 0

    rng = random.Random(42)  # the same history on every fresh start
    now = datetime.utcnow()
    days = data["history"]["days"]
    sessions = []
    for rfid, _ in cards:
        for _ in range(data["history"]["sessions_per_card"]):
            start = now - timedelta(days=rng.uniform(0.3, days), hours=rng.uniform(0, 12))
            station = rng.choice(data["stations"])
            sessions.append((start, rfid, station, rng.uniform(1.0, 4.5)))
    sessions.sort(key=lambda session: session[0])  # ids grow with time, like in production

    for start, rfid, station, hours in sessions:
        cur.execute(
            "INSERT INTO charge_transactions (station_id, rfid, created) VALUES (?, ?, ?)",
            (station["id"], rfid, timestamp(start)),
        )
        transaction_id = cur.lastrowid
        steps = max(2, math.floor(hours * 60 / LOG_INTERVAL_MINUTES))
        energy = 0.0
        for step in range(1, steps + 1):
            power = power_at(step / steps, station["max_kw"], rng)
            energy += power * LOG_INTERVAL_MINUTES / 60
            cur.execute(
                "INSERT INTO power_logs (charge_transaction_id, created, power_kw, energy_kwh) VALUES (?, ?, ?, ?)",
                (
                    transaction_id,
                    timestamp(start + timedelta(minutes=step * LOG_INTERVAL_MINUTES)),
                    power,
                    round(energy, 2),
                ),
            )
        cur.execute(
            "UPDATE charge_transactions SET final_energy_kwh = ? WHERE id = ?",
            (round(energy, 2), transaction_id),
        )

    # A card nobody registered, tried at a station a while ago.
    for rfid in data.get("unknown_cards", [])[:1]:
        cur.execute(
            "INSERT INTO refused_cards (rfid, station_id, created) VALUES (?, ?, ?)",
            (rfid, data["stations"][0]["id"], timestamp(now - timedelta(days=2))),
        )
    return len(sessions)


def main() -> None:
    with open(DEV_DATA_PATH, encoding="utf-8") as handle:
        data = json.load(handle)

    connection = sqlite3.connect(DB_PATH)
    try:
        cur = connection.cursor()
        cards = seed_residents(cur, data)
        seed_price(cur, data)
        sessions = seed_history(cur, data, cards)
        connection.commit()

        residents = cur.execute("SELECT COUNT(*) FROM residents").fetchone()[0]
        print(f"Seed done: {residents} residents, {len(cards)} seeded cards, {sessions} history sessions added")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
