-- Non-intrusive OCPP diagnostic events captured by the station controller: WebSocket handshake headers,
-- BootNotification details, read-only GetConfiguration snapshots, StatusNotification transitions,
-- Authorize/StartTransaction/StopTransaction payloads, DataTransfer calls, and deduplicated MeterValues
-- measurand summaries. Heartbeats are excluded to keep storage bounded.
-- All times are UTC, like the other tables.
CREATE TABLE station_ocpp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Recent diagnostic events of one station, newest first.
CREATE INDEX idx_station_ocpp_events_station_created ON station_ocpp_events (station_id, created_at);

-- Latest event of a specific action for a station (e.g. GetConfiguration, BootNotification, WebSocketConnect).
CREATE INDEX idx_station_ocpp_events_station_action_created ON station_ocpp_events (station_id, action, created_at);
