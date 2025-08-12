-- Remove all power logs where energy_kwh = 0 (end of charging messages)
DELETE FROM power_logs WHERE energy_kwh = 0;
