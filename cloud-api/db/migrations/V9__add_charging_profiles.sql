CREATE TABLE charging_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    profile_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    max_current DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on profile_type for efficient filtering
CREATE INDEX idx_charging_profiles_type ON charging_profiles(profile_type);

-- Create index on status for efficient filtering
CREATE INDEX idx_charging_profiles_status ON charging_profiles(status);
