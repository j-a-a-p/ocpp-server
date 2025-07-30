-- Add final_energy_kwh column to charge_transactions table
ALTER TABLE charge_transactions ADD COLUMN final_energy_kwh REAL;

-- Create power_logs table
CREATE TABLE power_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_transaction_id INTEGER NOT NULL,
    created DATETIME DEFAULT (CURRENT_TIMESTAMP),
    power_kw REAL NOT NULL,
    energy_kwh REAL NOT NULL,
    FOREIGN KEY (charge_transaction_id) REFERENCES charge_transactions (id) ON DELETE CASCADE
);

-- Create index on charge_transaction_id for better query performance
CREATE INDEX idx_power_logs_charge_transaction_id ON power_logs (charge_transaction_id); 