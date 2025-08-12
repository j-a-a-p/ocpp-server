-- Add name column to cards table
ALTER TABLE cards ADD COLUMN name TEXT;

-- Update existing records to use RFID as name
UPDATE cards SET name = rfid WHERE name IS NULL;

-- Make name column not null
ALTER TABLE cards ALTER COLUMN name SET NOT NULL;
