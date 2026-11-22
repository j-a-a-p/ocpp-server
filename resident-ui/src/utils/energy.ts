import type { PowerLog } from "../services/chargeTransactionService";
import { parseUtc } from "./dates";

export interface RunningLog {
  log: PowerLog;
  time: Date;
  /** Energy of the session up to this log (kWh). Never goes down. */
  energy: number;
  /** Cost of the session up to this log (euro). */
  cost: number;
}

/**
 * The charger reports a running energy counter, but that counter drops now and then (it restarts
 * when a charge is paused and resumed, and the last reading of a session can be another counter).
 * The energy of a session is therefore the sum of the steps upwards: a drop adds nothing and the
 * next step is taken from the value after the drop.
 *
 * A log's delta_power_cost is only the cost of the step to that log, so the cost is added up too.
 */
export const runningTotals = (powerLogs: PowerLog[]): RunningLog[] => {
  const sorted = [...powerLogs].sort((a, b) => parseUtc(a.created).getTime() - parseUtc(b.created).getTime());
  let energy = 0;
  let cost = 0;
  let previous: number | null = null;

  return sorted.map((log) => {
    energy += previous === null ? log.energy_kwh : Math.max(0, log.energy_kwh - previous);
    cost += log.delta_power_cost || 0;
    previous = log.energy_kwh;
    return { log, time: parseUtc(log.created), energy, cost };
  });
};
