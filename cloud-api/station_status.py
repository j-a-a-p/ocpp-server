"""Which charging stations are online, and when they were, for the stations page of the management portal.

The station controller writes one row per WebSocket connection of a station (station_connections).
A connection that has not ended counts as online while its station was heard recently: the controller
may have stopped without closing it, and then nobody is listening to the station any more.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models import StationConnection

# Stations send a heartbeat every 30 seconds (the interval of the station controller's BootNotification
# answer). A connection that was not heard for four of them is not online any more.
ONLINE_GRACE = timedelta(minutes=2)


def _now() -> datetime:
    """UTC without a timezone, the way the database stores its times."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=timezone.utc)


def _is_live(connection: StationConnection, now: datetime) -> bool:
    return connection.disconnected_at is None and now - connection.last_seen_at <= ONLINE_GRACE


def _end(connection: StationConnection, now: datetime) -> datetime:
    """The moment the connection ended, or now while its station is still there."""
    if connection.disconnected_at is not None:
        return connection.disconnected_at
    return now if _is_live(connection, now) else connection.last_seen_at


def _merge(periods: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Joins periods that overlap. A station that reconnects is for a moment connected twice, the new
    connection is there before the controller notices that the old one died."""
    merged: list[list[datetime]] = []
    for start, end in sorted(periods):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(start, end) for start, end in merged]


def calculate_station_overview(db: Session, hours: int, now: Optional[datetime] = None) -> dict:
    """The stations that ever connected, with whether they are online now and their online periods in the
    last `hours` hours. `now` is UTC without a timezone."""
    now = now or _now()
    since = now - timedelta(hours=hours)

    # Every station that ever connected, also when it was not online in the window.
    known = {
        station_id: (first_connected, last_seen, last_disconnected)
        for station_id, first_connected, last_seen, last_disconnected in db.query(
            StationConnection.station_id,
            func.min(StationConnection.connected_at),
            func.max(StationConnection.last_seen_at),
            func.max(StationConnection.disconnected_at),
        ).group_by(StationConnection.station_id)
    }

    # What overlaps the window: connections that ended in it, and the ones that have not ended.
    in_window = (
        db.query(StationConnection)
        .filter(or_(StationConnection.disconnected_at.is_(None), StationConnection.disconnected_at >= since))
        .order_by(StationConnection.connected_at, StationConnection.id)
        .all()
    )
    by_station: dict[str, list[StationConnection]] = {}
    for connection in in_window:
        by_station.setdefault(connection.station_id, []).append(connection)

    stations = []
    for station_id in sorted(known):
        first_seen, last_heard, last_disconnected = known[station_id]
        connections = by_station.get(station_id, [])

        periods = []
        for connection in connections:
            start, end = max(connection.connected_at, since), min(_end(connection, now), now)
            if end > start:
                periods.append((start, end))
        periods = _merge(periods)

        live = [connection for connection in connections if _is_live(connection, now)]
        online_seconds = sum((end - start).total_seconds() for start, end in periods)
        # A station that connected for the first time an hour ago was not offline the 23 hours before.
        tracked_seconds = (now - max(since, first_seen)).total_seconds()

        stations.append({
            "station_id": station_id,
            "online": bool(live),
            "connected_since": _utc(min(connection.connected_at for connection in live)) if live else None,
            "last_seen": _utc(max(last_heard, last_disconnected) if last_disconnected else last_heard),
            "first_seen": _utc(first_seen),
            "uptime_percent": round(min(100.0, online_seconds / tracked_seconds * 100), 1) if tracked_seconds > 0 else None,
            "connections": sum(1 for connection in connections if connection.connected_at >= since),
            "online_periods": [{"start": _utc(start), "end": _utc(end)} for start, end in periods],
        })

    return {
        "generated_at": _utc(now),
        "window_start": _utc(since),
        "window_hours": hours,
        "online_count": sum(1 for station in stations if station["online"]),
        "stations": stations,
    }
