CREATE TABLE charging_costs (
    id SERIAL PRIMARY KEY AUTOINCREMENT,
    kwh_price DECIMAL(10,4) NOT NULL,
    end_date DATE,
    created created DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index on end_date for efficient queries
CREATE INDEX idx_charging_costs_end_date ON charging_costs(end_date);

-- Create unique constraint to ensure only one active record (no end_date or future end_date)
-- This will be enforced at the application level for better error handling
