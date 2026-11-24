-- A manager can switch a card off, for example when it was lost. A card that is off stays registered (with its charge
-- history) but cannot start a charge.
ALTER TABLE cards ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
