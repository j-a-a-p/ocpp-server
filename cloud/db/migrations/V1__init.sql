-- Owners Table
CREATE TABLE IF NOT EXISTS owners (
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
CREATE TABLE IF NOT EXISTS cards (
    rfid TEXT PRIMARY KEY,  -- Using RFID as primary key
    owner_id INTEGER,
    FOREIGN KEY (owner_id) REFERENCES owners (id) ON DELETE SET NULL
);

-- Failed Authentications Table
CREATE TABLE IF NOT EXISTS failed_authentications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfid TEXT NOT NULL,
    station_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
