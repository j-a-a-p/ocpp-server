-- Owners Table
CREATE TABLE owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    invite_token TEXT,
    invite_expires_at DATETIME
);

CREATE INDEX idx_owners_email ON owners(email);

-- Cards Table
CREATE TABLE cards (
    rfid TEXT PRIMARY KEY,  -- Using RFID as primary key
    owner_id INTEGER,
    FOREIGN KEY (owner_id) REFERENCES owners (id) ON DELETE RESTRICT
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
