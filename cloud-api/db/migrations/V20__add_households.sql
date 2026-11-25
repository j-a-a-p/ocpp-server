-- Households: one tenancy at an address, with a start date, optional end date, and one main member
-- who receives invoices and updates and can invite household members.
CREATE TABLE households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    street_name TEXT,
    house_number TEXT,
    house_number_suffix TEXT,
    zip_code TEXT,
    city TEXT,
    start_date DATE,
    end_date DATE
);

CREATE INDEX idx_households_address ON households(street_name, house_number, house_number_suffix);

ALTER TABLE residents ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE residents ADD COLUMN is_main_member INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_residents_household ON residents(household_id);
CREATE UNIQUE INDEX idx_households_one_main_member ON residents(household_id) WHERE is_main_member = 1;

-- Backfill: every existing resident who is not a household member becomes the main member of an
-- open-ended household with their current address. Using their id as the household id lets existing
-- household members attach directly through household_head_id.
INSERT INTO households (id, street_name, house_number, house_number_suffix, zip_code, city, start_date, end_date)
SELECT id, street_name, house_number, house_number_suffix, zip_code, city, NULL, NULL
FROM residents
WHERE (',' || roles || ',') LIKE '%,resident,%'
  AND household_head_id IS NULL;

UPDATE residents
SET household_id = CASE
        WHEN household_head_id IS NULL THEN id
        WHEN EXISTS (SELECT 1 FROM households WHERE id = residents.household_head_id) THEN household_head_id
        ELSE NULL
    END,
    is_main_member = CASE
        WHEN household_head_id IS NULL THEN 1
        ELSE 0
    END
WHERE (',' || roles || ',') LIKE '%,resident,%';

-- Clear legacy address and head columns (kept on the table for SQLite FK compatibility; households is now the source of truth).
DROP INDEX IF EXISTS idx_residents_address;
DROP INDEX IF EXISTS idx_residents_household_head;

UPDATE residents
SET street_name = NULL,
    house_number = NULL,
    house_number_suffix = NULL,
    zip_code = NULL,
    city = NULL,
    household_head_id = NULL;
