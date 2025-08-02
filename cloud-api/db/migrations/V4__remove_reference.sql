-- Remove reference column from residents table
-- SQLite doesn't support dropping UNIQUE columns directly, so we need to recreate the table

-- Create new table without reference column
CREATE TABLE residents_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    invite_token TEXT,
    invite_expires_at DATETIME,
    login_token TEXT,
    login_expires_at DATETIME
);

-- Copy data from old table to new table (excluding reference column)
INSERT INTO residents_new (id, full_name, email, status, invite_token, invite_expires_at, login_token, login_expires_at)
SELECT id, full_name, email, status, invite_token, invite_expires_at, login_token, login_expires_at
FROM residents;

-- Drop the old table
DROP TABLE residents;

-- Rename new table to original name
ALTER TABLE residents_new RENAME TO residents;

-- Recreate the unique index on login_token
CREATE UNIQUE INDEX idx_residents_login_token ON residents(login_token);

-- Recreate the index on email
CREATE INDEX idx_residents_email ON residents(email); 