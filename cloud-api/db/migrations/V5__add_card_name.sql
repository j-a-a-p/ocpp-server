-- Create new cards table with name column
CREATE TABLE cards_new (
    rfid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    resident_id INTEGER,
    FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE RESTRICT
);

-- Copy existing data, using rfid as name for existing records
INSERT INTO cards_new (rfid, name, resident_id)
SELECT rfid, rfid, resident_id FROM cards;

DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
