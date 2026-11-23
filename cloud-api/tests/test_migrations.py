"""Migrations that change existing data, tested on data that was there before the migration."""
import re
import sqlite3

from conftest import MIGRATIONS, migration_files


def database_before(tmp_path, version: int) -> sqlite3.Connection:
    """A database migrated up to, but not including, the given version."""
    connection = sqlite3.connect(tmp_path / "old.db")
    for migration in migration_files():
        if int(re.match(r"V(\d+)__", migration.name).group(1)) < version:
            connection.executescript(migration.read_text())
    return connection


def add_session(connection: sqlite3.Connection, transaction_id: int, energies: list[float], stored_total: float | None):
    connection.execute(
        "INSERT INTO charge_transactions (id, station_id, rfid, final_energy_kwh) VALUES (?, 'CP1', 'A', ?)",
        (transaction_id, stored_total),
    )
    for minute, energy in enumerate(energies):
        connection.execute(
            "INSERT INTO power_logs (charge_transaction_id, created, power_kw, energy_kwh) VALUES (?, ?, 7, ?)",
            (transaction_id, f"2026-11-22 08:{minute:02d}:00", energy),
        )


def totals(connection: sqlite3.Connection) -> dict[int, float | None]:
    return dict(connection.execute("SELECT id, final_energy_kwh FROM charge_transactions").fetchall())


def test_v17_makes_every_existing_account_a_manager_and_a_resident(tmp_path):
    connection = database_before(tmp_path, 17)
    for number, status in enumerate(["ACTIVE", "INVITED"]):
        connection.execute(
            "INSERT INTO residents (full_name, email, status) VALUES (?, ?, ?)", (f"Person {number}", f"p{number}@example.com", status)
        )

    connection.executescript((MIGRATIONS / "V17__add_roles_and_address.sql").read_text())

    rows = connection.execute(
        "SELECT roles, street_name, house_number, house_number_suffix, household_head_id FROM residents"
    ).fetchall()
    assert rows == [("manager,resident", None, None, None, None)] * 2


def test_v17_gives_accounts_that_are_added_afterwards_no_roles(tmp_path):
    connection = database_before(tmp_path, 18)

    connection.execute("INSERT INTO residents (full_name, email, status) VALUES ('New', 'new@example.com', 'INVITED')")

    assert connection.execute("SELECT roles FROM residents").fetchall() == [("",)]


def test_v18_adds_an_empty_zip_code_and_city(tmp_path):
    connection = database_before(tmp_path, 18)
    connection.execute("INSERT INTO residents (full_name, email, status, roles) VALUES ('Anna', 'anna@example.com', 'ACTIVE', 'resident')")

    connection.executescript((MIGRATIONS / "V18__add_zip_code_and_city.sql").read_text())

    assert connection.execute("SELECT zip_code, city FROM residents").fetchall() == [(None, None)]


def test_v11_counts_the_steps_upwards_and_ignores_drops(tmp_path):
    connection = database_before(tmp_path, 11)
    add_session(connection, 1, [1.0, 2.5, 4.0, 0.5, 1.5], stored_total=1.5)  # counter restarted after a pause
    add_session(connection, 2, [10.0, 12.0, 2.2], stored_total=2.2)  # last reading from another counter
    add_session(connection, 3, [1.0, 2.0, 3.0], stored_total=3.0)  # nothing wrong with this one

    connection.executescript((MIGRATIONS / "V11__recalculate_final_energy.sql").read_text())

    assert totals(connection) == {1: 5.0, 2: 12.0, 3: 3.0}


def test_v11_leaves_sessions_without_power_logs_alone(tmp_path):
    connection = database_before(tmp_path, 11)
    add_session(connection, 1, [], stored_total=None)
    add_session(connection, 2, [], stored_total=0)

    connection.executescript((MIGRATIONS / "V11__recalculate_final_energy.sql").read_text())

    assert totals(connection) == {1: None, 2: 0}
