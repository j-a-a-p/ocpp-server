"""Fixtures for the cloud API tests.

Every test gets its own SQLite database, built from the real Flyway migrations, and
a fake mailbox instead of AWS SES. The real FastAPI app runs on top, so the tests
cover routing, authentication, the database schema and the business rules together.
"""
import re
import sqlite3
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# main.py runs `flyway migrate` when it is imported. The tests build their own databases.
with mock.patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, "", "")):
    from main import app

import dependencies
import invite
from models import Card, ChargeTransaction, PowerLog, RefusedCard, Resident, ResidentStatus

MIGRATIONS = Path(__file__).resolve().parents[1] / "db" / "migrations"
API_KEY = "your-secure-api-key"
INVITE_URL = "https://charge.example.test/resident-ui"
JWT_SECRET = "test-secret-with-enough-length-for-hs256"


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS.glob("V*.sql"), key=lambda path: int(re.match(r"V(\d+)__", path.name).group(1)))


@pytest.fixture
def session_factory(tmp_path):
    """A migrated, empty database, with foreign keys enforced like in production."""
    path = tmp_path / "cloud.db"
    raw = sqlite3.connect(path)
    for migration in migration_files():
        raw.executescript(migration.read_text())
    raw.commit()
    raw.close()

    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def get_test_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[dependencies.get_db_dependency] = get_test_db
    yield factory
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def db(session_factory):
    """A session to arrange and check data directly in the database."""
    session = session_factory()
    yield session
    session.close()


@pytest.fixture
def outbox(monkeypatch):
    """The mails that would have gone out through SES."""
    sent = []

    class FakeSender:
        def send_email(self, sender, recipient, subject, body):
            sent.append({"sender": sender, "recipient": recipient, "subject": subject, "body": body})

    monkeypatch.setattr(invite, "SESEmailSender", FakeSender)
    monkeypatch.setattr(invite, "INVITE_URL", INVITE_URL)
    monkeypatch.setattr(invite, "JWT_SECRET", JWT_SECRET)
    return sent


@pytest.fixture
def client(session_factory, outbox):
    """A visitor who is not logged in."""
    return TestClient(app)


@pytest.fixture
def api_key_headers():
    return {"X-API-Key": API_KEY}


@pytest.fixture
def make_resident(db):
    def make(email="resident@example.com", full_name="Test Resident", status=ResidentStatus.ACTIVE, **extra) -> Resident:
        resident = Resident(email=email, full_name=full_name, status=status, **extra)
        db.add(resident)
        db.commit()
        db.refresh(resident)
        return resident

    return make


@pytest.fixture
def make_card(db):
    def make(resident: Resident, rfid="04AABBCC", name=None) -> Card:
        card = Card(rfid=rfid, name=name or f"Card {rfid}", resident_id=resident.id)
        db.add(card)
        db.commit()
        return card

    return make


@pytest.fixture
def make_transaction(db):
    """A charge with power logs. `logs` are (minutes after the start, kW, kWh on the meter)."""

    def make(card: Card, logs=(), station_id="CP1", started: datetime | None = None, final_energy_kwh=None) -> ChargeTransaction:
        started = started or datetime.utcnow().replace(microsecond=0)
        transaction = ChargeTransaction(
            station_id=station_id, rfid=card.rfid, created=started,
            final_energy_kwh=final_energy_kwh if final_energy_kwh is not None else (logs[-1][2] if logs else None),
        )
        db.add(transaction)
        db.commit()
        for minutes, power_kw, energy_kwh in logs:
            db.add(PowerLog(
                charge_transaction_id=transaction.id,
                created=started + timedelta(minutes=minutes),
                power_kw=power_kw, energy_kwh=energy_kwh,
            ))
        db.commit()
        db.refresh(transaction)
        return transaction

    return make


@pytest.fixture
def make_refused_card(db):
    def make(rfid="DEADBEEF", station_id="CP1", age=timedelta(0)) -> RefusedCard:
        refused = RefusedCard(rfid=rfid, station_id=station_id, created=datetime.utcnow() - age)
        db.add(refused)
        db.commit()
        db.refresh(refused)
        return refused

    return make


@pytest.fixture
def login_as(session_factory, outbox):
    """A client with the cookie of the given resident, like after following a login link."""

    def login(resident: Resident) -> TestClient:
        browser = TestClient(app)
        browser.cookies.set("auth_token", invite.generate_auth_token(resident.id))
        return browser

    return login


@pytest.fixture
def me(make_resident):
    """The resident who is logged in in the `user` client."""
    return make_resident(email="me@example.com", full_name="Me Myself")


@pytest.fixture
def user(login_as, me):
    return login_as(me)
