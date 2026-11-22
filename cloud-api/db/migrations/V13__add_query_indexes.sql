-- Indexes for the queries of the portals and the station controller.

-- The logs of one charge in time order: the cost of a charge, the energy steps of the analytics,
-- and the last log of a charge that the station controller reads on every meter value.
-- It also serves every lookup by charge_transaction_id alone, so it replaces the old index.
CREATE INDEX idx_power_logs_transaction_created ON power_logs (charge_transaction_id, created);
DROP INDEX idx_power_logs_charge_transaction_id;

-- Power logs by time: the newest logs first, and the logs of the last years for the analytics.
CREATE INDEX idx_power_logs_created ON power_logs (created);

-- The charges of the management portal, newest first.
CREATE INDEX idx_charge_transactions_created ON charge_transactions (created);

-- The cards of a resident: "my cards" and "my charges".
CREATE INDEX idx_cards_resident_id ON cards (resident_id);

-- The latest refused card at a station, when a resident adds a card.
CREATE INDEX idx_refused_cards_station_created ON refused_cards (station_id, created);

-- Statistics for the query planner, so it picks these indexes.
ANALYZE;
