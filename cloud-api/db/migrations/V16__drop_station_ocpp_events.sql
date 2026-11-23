-- Removes the temporary OCPP diagnostics table added in V15 after completing charger capability discovery.
DROP INDEX IF EXISTS idx_station_ocpp_events_station_action_created;
DROP INDEX IF EXISTS idx_station_ocpp_events_station_created;
DROP TABLE IF EXISTS station_ocpp_events;
