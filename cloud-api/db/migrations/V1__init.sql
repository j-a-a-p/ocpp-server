-- Residents Table
CREATE TABLE residents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    invite_token TEXT,
    invite_expires_at DATETIME
);

CREATE INDEX idx_residents_email ON residents(email);

-- Cards Table
CREATE TABLE cards (
    rfid TEXT PRIMARY KEY,  -- Using RFID as primary key
    resident_id INTEGER,
    FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE RESTRICT
);

-- Failed Authentications Table
CREATE TABLE failed_authentications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfid TEXT NOT NULL,
    station_id TEXT NOT NULL,
    created DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE charge_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    rfid TEXT NOT NULL,
    created DATETIME DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (rfid) REFERENCES cards(rfid) ON DELETE RESTRICT
);

CREATE INDEX ix_charge_transactions_rfid ON charge_transactions (rfid);
