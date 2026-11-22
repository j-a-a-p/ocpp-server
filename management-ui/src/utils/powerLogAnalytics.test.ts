import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerLog } from "../services/powerLogService";
import { calculateAnalytics, summarize, withEnergyDeltas } from "./powerLogAnalytics";

// Local time on purpose: the analytics group by the local hour, month and year.
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();

let nextId = 1;
const log = (transaction: number, created: string, power_kw: number, energy_kwh: number): PowerLog => ({
  id: nextId++,
  charge_transaction_id: transaction,
  created,
  power_kw,
  energy_kwh,
});

beforeEach(() => {
  nextId = 1;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 12, 0)); // 22 November 2026
});

afterEach(() => vi.useRealTimers());

describe("withEnergyDeltas", () => {
  it("turns the running meter total of a session into the energy of each log", () => {
    const logs = withEnergyDeltas([
      log(1, at(11, 20, 10, 0), 7, 2),
      log(1, at(11, 20, 10, 5), 7, 5),
      log(1, at(11, 20, 10, 10), 7, 5.5),
    ]);

    expect(logs.map((entry) => entry.delta_kwh)).toEqual([2, 3, 0.5]);
  });

  it("puts the logs in time order before it takes the difference", () => {
    const logs = withEnergyDeltas([
      log(1, at(11, 20, 10, 10), 7, 5.5),
      log(1, at(11, 20, 10, 0), 7, 2),
      log(1, at(11, 20, 10, 5), 7, 5),
    ]);

    expect(logs.map((entry) => [entry.energy_kwh, entry.delta_kwh])).toEqual([[2, 2], [5, 3], [5.5, 0.5]]);
  });

  it("keeps sessions apart", () => {
    const logs = withEnergyDeltas([
      log(1, at(11, 20, 10, 0), 7, 4),
      log(2, at(11, 20, 10, 1), 7, 3),
      log(1, at(11, 20, 10, 5), 7, 6),
      log(2, at(11, 20, 10, 6), 7, 4),
    ]);

    const byTransaction = (id: number) => logs.filter((entry) => entry.charge_transaction_id === id).map((entry) => entry.delta_kwh);
    expect(byTransaction(1)).toEqual([4, 2]);
    expect(byTransaction(2)).toEqual([3, 1]);
  });

  it("never counts a meter that goes backwards as negative energy", () => {
    const logs = withEnergyDeltas([log(1, at(11, 20, 10, 0), 7, 5), log(1, at(11, 20, 10, 5), 7, 4)]);

    expect(logs.map((entry) => entry.delta_kwh)).toEqual([5, 0]);
  });

  it("parses the timestamps as UTC", () => {
    const [entry] = withEnergyDeltas([log(1, "2026-11-20T10:00:00", 7, 1)]);

    expect(entry.time.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });
});

describe("summarize", () => {
  it("adds the increases, not the running totals", () => {
    // One session of 6 kWh in four logs. Adding the totals would give 1 + 3 + 5 + 6 = 15 kWh.
    const logs = withEnergyDeltas([
      log(1, at(11, 20, 10, 0), 7, 1),
      log(1, at(11, 20, 10, 5), 8, 3),
      log(1, at(11, 20, 10, 10), 9, 5),
      log(1, at(11, 20, 10, 15), 6, 6),
    ]);

    const summary = summarize(logs);

    expect(summary.total_kwh).toBe(6);
    expect(summary.total_records).toBe(4);
    expect(summary.max_power_kw).toBe(9);
    expect(summary.avg_power_kw).toBe(7.5);
    expect(summary.total_hours).toBeCloseTo(0.25);
  });

  it("adds up the hours of every session separately", () => {
    const logs = withEnergyDeltas([
      log(1, at(11, 20, 10, 0), 7, 1),
      log(1, at(11, 20, 11, 0), 7, 2),
      log(2, at(11, 21, 10, 0), 7, 1),
      log(2, at(11, 21, 10, 30), 7, 2),
    ]);

    expect(summarize(logs).total_hours).toBeCloseTo(1.5);
  });

  it("is all zeros without logs", () => {
    expect(summarize([])).toEqual({ total_records: 0, total_hours: 0, total_kwh: 0, max_power_kw: 0, avg_power_kw: 0 });
  });

  it("does not count the hours of a session with one log", () => {
    expect(summarize(withEnergyDeltas([log(1, at(11, 20, 10, 0), 7, 1)])).total_hours).toBe(0);
  });
});

describe("calculateAnalytics", () => {
  it("summarizes the current year", () => {
    const analytics = calculateAnalytics([
      log(1, at(11, 20, 10, 0), 7, 2),
      log(1, at(11, 20, 10, 30), 7, 6),
      log(2, at(3, 2, 8, 0), 11, 3),
      log(3, at(12, 31, 8, 0), 5, 1), // later this year
    ]);

    // All four are from 2026: 6 kWh of session 1, 3 of session 2, 1 of session 3.
    expect(analytics.current_year_summary.total_kwh).toBe(10);
    expect(analytics.current_year_summary.total_records).toBe(4);
  });

  it("leaves logs of other years out of the current year", () => {
    const analytics = calculateAnalytics([
      log(1, new Date(2025, 5, 1, 10).toISOString(), 7, 4),
      log(2, at(11, 20, 10, 0), 7, 2),
    ]);

    expect(analytics.current_year_summary.total_kwh).toBe(2);
  });

  it("groups the last twelve months by month, newest first", () => {
    const analytics = calculateAnalytics([
      log(1, at(11, 20, 10, 0), 7, 2),
      log(2, at(10, 5, 10, 0), 7, 3),
      log(3, at(10, 6, 10, 0), 7, 1),
      log(4, new Date(2025, 11, 1, 10).toISOString(), 7, 9), // 11 months ago: still inside the window
    ]);

    expect(analytics.monthly_data.map((month) => `${month.month_name} ${month.year}`)).toEqual([
      "November 2026",
      "October 2026",
      "December 2025",
    ]);
    expect(analytics.monthly_data[1]).toMatchObject({ total_kwh: 4, total_records: 2 });
  });

  it("leaves out logs from before the last twelve months", () => {
    const analytics = calculateAnalytics([
      log(1, new Date(2025, 9, 31, 10).toISOString(), 7, 4), // 13 months ago
      log(2, at(11, 20, 10, 0), 7, 2),
    ]);

    expect(analytics.monthly_data.map((month) => month.month_name)).toEqual(["November"]);
  });

  it("adds up the power per hour of the day", () => {
    const analytics = calculateAnalytics([
      log(1, at(11, 20, 9, 0), 7, 1),
      log(1, at(11, 20, 9, 30), 3, 2),
      log(2, at(11, 21, 18, 0), 11, 1),
    ]);

    expect(analytics.hourly_distribution).toHaveLength(24);
    expect(analytics.hourly_distribution[9]).toBe(10);
    expect(analytics.hourly_distribution[18]).toBe(11);
    expect(analytics.hourly_distribution.reduce((sum, value) => sum + value, 0)).toBe(21);
  });
});
