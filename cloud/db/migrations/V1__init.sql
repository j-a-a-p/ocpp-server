-- Owner References Table
CREATE TABLE IF NOT EXISTS owner_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL
);

-- Owners Table
CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    reference_id INTEGER,
    FOREIGN KEY (reference_id) REFERENCES owner_references (id) ON DELETE SET NULL
);

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