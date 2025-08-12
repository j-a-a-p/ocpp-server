-- Delete all existing charging costs
DELETE FROM charging_costs;

-- Insert a new charging cost record with price 0.30
INSERT INTO charging_costs (kwh_price, end_date, created) 
VALUES (0.3000, NULL, CURRENT_TIMESTAMP);
