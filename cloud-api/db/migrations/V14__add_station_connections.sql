-- When the charging stations are online. The station controller writes one row for every WebSocket
-- connection of a station: it opens the row when the station connects, keeps last_seen_at up to date
-- with the heartbeats, and fills disconnected_at when the connection ends.
-- A row without disconnected_at is a connection that is open now (or that was open when the station
-- controller stopped, which the station controller cleans up when it starts again).
-- All times are UTC, like the other tables.
CREATE TABLE station_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    connected_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    last_seen_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    disconnected_at DATETIME
);

-- The connections of one station in time order: the online periods of the stations page.
CREATE INDEX idx_station_connections_station_connected ON station_connections (station_id, connected_at);

-- The connections that are open now: who is online, and the clean up when the station controller starts.
CREATE INDEX idx_station_connections_open ON station_connections (station_id) WHERE disconnected_at IS NULL;
