-- The energy counter of the charger drops now and then (it restarts when a charge is paused and
-- resumed, and the last reading of a session can be a different counter), so the stored total of
-- many sessions was a value from after such a drop. The energy of a session is the sum of the steps
-- upwards: a drop adds nothing, and the next step is taken from the value after the drop.
-- This is also how the station controller keeps the total from now on.
UPDATE charge_transactions
SET final_energy_kwh = (
    SELECT ROUND(SUM(step), 3)
    FROM (
        SELECT CASE
                   WHEN previous IS NULL THEN energy_kwh
                   WHEN energy_kwh > previous THEN energy_kwh - previous
                   ELSE 0
               END AS step
        FROM (
            SELECT energy_kwh,
                   LAG(energy_kwh) OVER (ORDER BY created, id) AS previous
            FROM power_logs
            WHERE power_logs.charge_transaction_id = charge_transactions.id
        )
    )
)
WHERE EXISTS (
    SELECT 1 FROM power_logs WHERE power_logs.charge_transaction_id = charge_transactions.id
);
