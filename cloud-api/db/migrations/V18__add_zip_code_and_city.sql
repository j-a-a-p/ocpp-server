-- The rest of the address. Existing accounts have none until a manager fills them in.
ALTER TABLE residents ADD COLUMN zip_code TEXT;
ALTER TABLE residents ADD COLUMN city TEXT;
