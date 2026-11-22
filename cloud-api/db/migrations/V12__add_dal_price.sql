-- The price per kWh is split in two tariffs: "normaal" (kwh_price, as before) and "dal" (kwh_price_dal).
-- Dal is the weekend and every day from 21:00 to 07:00 (Dutch time), normaal is the rest.
ALTER TABLE charging_costs ADD COLUMN kwh_price_dal DECIMAL(10,4);

-- Earlier prices were one price for all hours.
UPDATE charging_costs SET kwh_price_dal = kwh_price;

-- The current price: normaal 0.30 and dal 0.29.
UPDATE charging_costs SET kwh_price = 0.3000, kwh_price_dal = 0.2900 WHERE end_date IS NULL;
