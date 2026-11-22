import { describe, expect, it } from "vitest";
import type { PowerLog } from "../services/chargeTransactionService";
import { runningTotals } from "./energy";

let nextId = 1;
const log = (minute: number, energy_kwh: number, delta_power_cost = 0): PowerLog => ({
  id: nextId++,
  charge_transaction_id: 1,
  created: `2026-11-22T08:${String(minute).padStart(2, "0")}:00`,
  power_kw: 7,
  energy_kwh,
  delta_power_cost,
  kwh_rate: 0.3,
});

describe("runningTotals", () => {
  it("is empty without logs", () => {
    expect(runningTotals([])).toEqual([]);
  });

  it("follows the counter of the charger while it only goes up", () => {
    expect(runningTotals([log(0, 1), log(1, 2.5), log(2, 4)]).map((entry) => entry.energy)).toEqual([1, 2.5, 4]);
  });

  it("never goes down when the counter drops, and counts on from the value after the drop", () => {
    const totals = runningTotals([log(0, 1), log(1, 4), log(2, 0.5), log(3, 1.5)]);

    expect(totals.map((entry) => entry.energy)).toEqual([1, 4, 4, 5]);
  });

  it("keeps the total when the last reading is lower, like the end of the session in the chart", () => {
    const totals = runningTotals([log(0, 11), log(1, 12.01), log(2, 2.24)]);

    expect(totals[totals.length - 1].energy).toBe(12.01);
  });

  it("adds up the cost of the steps to the cost so far", () => {
    const totals = runningTotals([log(0, 1, 0.3), log(1, 2, 0.3), log(2, 0.5, 0), log(3, 1.5, 0.3)]);

    expect(totals.map((entry) => Math.round(entry.cost * 100) / 100)).toEqual([0.3, 0.6, 0.6, 0.9]);
  });

  it("puts the logs in time order and leaves the input alone", () => {
    const logs = [log(2, 3), log(0, 1), log(1, 2)];

    expect(runningTotals(logs).map((entry) => entry.energy)).toEqual([1, 2, 3]);
    expect(logs.map((entry) => entry.energy_kwh)).toEqual([3, 1, 2]);
  });
});
