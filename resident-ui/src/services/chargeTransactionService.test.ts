import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch, requests } from "../test/mockFetch";
import { calculateMonthlyEnergyStats, getAllCurrentResidentTransactions, type ChargeTransaction } from "./chargeTransactionService";

const charge = (overrides: Partial<ChargeTransaction> & { cost?: number }): ChargeTransaction => ({
  id: 1,
  station_id: "CP1",
  rfid: "04AABBCC",
  created: "2026-11-15T12:00:00",
  final_energy_kwh: 10,
  power_logs: [],
  ...overrides,
  ...(overrides.cost !== undefined && {
    power_logs: [{ id: 1, charge_transaction_id: 1, power_kw: 7, energy_kwh: 10, created: "2026-11-15T12:00:00", delta_power_cost: overrides.cost }],
  }),
});

describe("calculateMonthlyEnergyStats", () => {
  it("is empty without charges", () => {
    expect(calculateMonthlyEnergyStats([])).toEqual([]);
  });

  it("adds up energy, sessions and cost per month", () => {
    const stats = calculateMonthlyEnergyStats([
      charge({ id: 1, created: "2026-11-05T12:00:00", final_energy_kwh: 10, cost: 3 }),
      charge({ id: 2, created: "2026-11-20T12:00:00", final_energy_kwh: 5.5, cost: 1.65 }),
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ month: "November", year: 2026, totalEnergy: 15.5, transactionCount: 2 });
    expect(stats[0].totalCost).toBeCloseTo(4.65);
  });

  it("puts the newest month first, across years", () => {
    const stats = calculateMonthlyEnergyStats([
      charge({ id: 1, created: "2025-12-15T12:00:00" }),
      charge({ id: 2, created: "2026-01-15T12:00:00" }),
      charge({ id: 3, created: "2026-03-15T12:00:00" }),
    ]);

    expect(stats.map((month) => `${month.month} ${month.year}`)).toEqual(["March 2026", "January 2026", "December 2025"]);
  });

  it("skips charges without energy, such as one that is still starting", () => {
    const stats = calculateMonthlyEnergyStats([
      charge({ id: 1, final_energy_kwh: null }),
      charge({ id: 2, final_energy_kwh: 0 }),
      charge({ id: 3, final_energy_kwh: 4 }),
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ totalEnergy: 4, transactionCount: 1 });
  });

  it("groups by the local month of a UTC timestamp", () => {
    // Mid-month, so the result is the same in every timezone.
    const stats = calculateMonthlyEnergyStats([charge({ created: "2026-06-15T12:00:00" })]);

    expect(stats[0]).toMatchObject({ month: "June", year: 2026 });
  });
});

describe("getAllCurrentResidentTransactions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("asks for the charges of the logged in resident, with the cookie", async () => {
    const fetchMock = mockFetch({ "GET /charge-transactions/my-transactions": json([charge({ id: 7 })]) });

    const result = await getAllCurrentResidentTransactions();

    expect(result.map((item) => item.id)).toEqual([7]);
    expect(requests(fetchMock)[0]).toMatch(/\/charge-transactions\/my-transactions\?skip=0&limit=1000$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("fails when the server answers with an error", async () => {
    mockFetch({ "GET /charge-transactions/my-transactions": json({ detail: "nope" }, 401) });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getAllCurrentResidentTransactions()).rejects.toThrow("Failed to fetch transactions");
  });
});
