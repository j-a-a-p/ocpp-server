-- V9 declared "id SERIAL PRIMARY KEY", which is PostgreSQL. SQLite does not generate values for
-- that column type, so no charging profile could be created. Recreate the table with a real
-- auto-incrementing id. Any rows are kept and get new ids.
CREATE TABLE charging_profiles_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    profile_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    max_current DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO charging_profiles_new (name, profile_type, status, max_current, created_at, updated_at)
SELECT name, profile_type, status, max_current, created_at, updated_at FROM charging_profiles;

DROP TABLE charging_profiles;

ALTER TABLE charging_profiles_new RENAME TO charging_profiles;

CREATE INDEX idx_charging_profiles_type ON charging_profiles(profile_type);
CREATE INDEX idx_charging_profiles_status ON charging_profiles(status);
