-- Add login token fields to residents table
ALTER TABLE residents ADD COLUMN login_token TEXT;
ALTER TABLE residents ADD COLUMN login_expires_at DATETIME;

-- Create unique index on login_token
CREATE UNIQUE INDEX idx_residents_login_token ON residents(login_token); 