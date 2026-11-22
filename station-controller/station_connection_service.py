import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from database import SessionLocal
from models import StationConnection


def utc_now() -> datetime:
    """UTC without a timezone, the way every table stores its times."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _write(what: str, work: Callable[[Session], Optional[int]]) -> Optional[int]:
    """Runs one database change. A problem is logged and ignored: knowing when a station is online is
    useful, but it must never keep the station from charging."""
    db = SessionLocal()
    try:
        result = work(db)
        db.commit()
        return result
    except Exception:
        db.rollback()
        logging.exception(f"Could not {what}")
        return None
    finally:
        db.close()


def _update(what: str, statement) -> Optional[int]:
    """Runs an UPDATE. Returns the number of rows it changed."""
    return _write(what, lambda db: db.execute(statement).rowcount)


class StationConnectionService:
    """Records when the charging stations are online, for the stations page of the management portal.

    A connection is one row: opened when the station connects, last_seen_at moves along with its
    messages, and disconnected_at is filled when the connection ends.
    """

    @staticmethod
    def open(station_id: str) -> Optional[int]:
        """A station connected. Returns the id of its connection, or None when it could not be stored."""
        def work(db: Session) -> int:
            now = utc_now()
            connection = StationConnection(station_id=station_id, connected_at=now, last_seen_at=now)
            db.add(connection)
            db.flush()
            return connection.id

        return _write(f"store the connection of station {station_id}", work)

    @staticmethod
    def rename(connection_id: int, station_id: str) -> None:
        """The station told its serial number, which is the name it is known by from now on."""
        _update(
            f"rename connection {connection_id} to {station_id}",
            update(StationConnection).where(StationConnection.id == connection_id).values(station_id=station_id),
        )

    @staticmethod
    def seen(connection_id: int) -> None:
        """The station is still there: a heartbeat or another message arrived."""
        _update(
            f"update connection {connection_id}",
            update(StationConnection)
            .where(StationConnection.id == connection_id, StationConnection.disconnected_at.is_(None))
            .values(last_seen_at=utc_now()),
        )

    @staticmethod
    def close(connection_id: int) -> None:
        """The connection ended."""
        _update(
            f"close connection {connection_id}",
            update(StationConnection)
            .where(StationConnection.id == connection_id, StationConnection.disconnected_at.is_(None))
            .values(disconnected_at=utc_now()),
        )

    @staticmethod
    def close_open() -> Optional[int]:
        """Closes the connections that were open when the station controller stopped. Nothing was listening
        then, so each ended at the last moment its station was heard. Returns how many were closed."""
        return _update(
            "close the connections of the previous run",
            update(StationConnection)
            .where(StationConnection.disconnected_at.is_(None))
            .values(disconnected_at=StationConnection.last_seen_at),
        )
