"""Fixtures for the station controller tests.

The controller talks to the database through the shared `database.SessionLocal`. The tests
point it at a temporary database built from the real Flyway migrations of the cloud API,
so nothing here touches the real database or /var/www/html.
"""
import re
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

import charge_point
import database
from meter_values_manager import MeterValuesManager
from models import Resident, ResidentStatus

MIGRATIONS = Path(__file__).resolve().parents[2] / "cloud-api" / "db" / "migrations"


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS.glob("V*.sql"), key=lambda path: int(re.match(r"V(\d+)__", path.name).group(1)))


@pytest.fixture(autouse=True)
def test_database(tmp_path):
    path = tmp_path / "cloud.db"
    raw = sqlite3.connect(path)
    for migration in migration_files():
        raw.executescript(migration.read_text())
    raw.commit()
    raw.close()

    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    original = database.SessionLocal.kw["bind"]
    database.SessionLocal.configure(bind=engine)
    yield engine
    database.SessionLocal.configure(bind=original)
    engine.dispose()


@pytest.fixture
def db(test_database):
    session = database.SessionLocal()
    yield session
    session.close()


@pytest.fixture
def meter_file(tmp_path, monkeypatch):
    """The meter_values.json that the web server publishes, redirected to a temporary file."""
    path = tmp_path / "meter_values.json"
    monkeypatch.setattr(
        charge_point, "MeterValuesManager",
        lambda charge_point=None: MeterValuesManager(json_path=str(path), charge_point=charge_point),
    )
    return path


def add_card(db, rfid: str, resident: Resident) -> None:
    """Cards are created by the cloud API. The controller's own model leaves out the name column."""
    db.execute(
        text("INSERT INTO cards (rfid, name, resident_id) VALUES (:rfid, :name, :resident_id)"),
        {"rfid": rfid, "name": rfid, "resident_id": resident.id},
    )
    db.commit()


@pytest.fixture
def resident_with_card(db):
    """An active resident with the card 04AABBCC."""
    resident = Resident(email="anna@example.com", full_name="Anna", status=ResidentStatus.ACTIVE)
    db.add(resident)
    db.commit()
    add_card(db, "04AABBCC", resident)
    return resident
