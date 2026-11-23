-- Roles and address of an account.
--
-- roles is a comma separated list of role names, for example 'manager,resident'. The known roles are in
-- the Role enum of the cloud API. A resident can charge and has an address. A household member is a
-- resident who was invited by another resident (household_head_id) and lives at the same address.
ALTER TABLE residents ADD COLUMN roles TEXT NOT NULL DEFAULT '';
ALTER TABLE residents ADD COLUMN street_name TEXT;
ALTER TABLE residents ADD COLUMN house_number TEXT;
ALTER TABLE residents ADD COLUMN house_number_suffix TEXT;
ALTER TABLE residents ADD COLUMN household_head_id INTEGER REFERENCES residents(id);

-- Everybody who exists today keeps full access and keeps charging.
UPDATE residents SET roles = 'manager,resident';

CREATE INDEX idx_residents_address ON residents(street_name, house_number, house_number_suffix);
CREATE INDEX idx_residents_household_head ON residents(household_head_id);
