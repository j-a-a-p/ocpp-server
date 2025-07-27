DROP TABLE IF EXISTS charge_transactions;

CREATE TABLE charge_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    rfid TEXT NOT NULL,
    created DATETIME DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (rfid) REFERENCES cards(rfid) ON DELETE SET NULL
);

CREATE INDEX ix_charge_transactions_rfid ON charge_transactions (rfid);
