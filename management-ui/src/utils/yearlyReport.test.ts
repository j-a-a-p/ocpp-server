import { describe, expect, it } from "vitest";
import type { ChargeTransaction } from "../services/chargeTransactionService";
import { buildYearlyReport } from "./yearlyReport";

const charge = (
  id: number,
  resident_name: string,
  created: string,
  final_energy_kwh: number,
  costs: number[],
  extra: Partial<ChargeTransaction> = {}
): ChargeTransaction => ({
  id, station_id: "CP1", rfid: "04AABBCC", created, final_energy_kwh, resident_name,
  power_logs: costs.map((delta_power_cost, index) => ({ id: id * 10 + index, delta_power_cost, kwh_rate: 0.3 })),
  ...extra,
});

// Mid-month dates, so the month is the same in every timezone.
const transactions = [
  charge(1, "Anna Anderson", "2026-11-20T12:00:00", 5.5, [1, 0.65], { card_name: "Tesla", ended: "2026-11-20T13:30:00" }),
  charge(2, "Anna Anderson", "2026-11-05T12:00:00", 10, [3]),
  charge(3, "Bob Brown", "2026-11-12T12:00:00", 8, [2.4]),
  charge(4, "Anna Anderson", "2026-10-15T12:00:00", 4, [1.2]),
  charge(5, "Anna Anderson", "2025-12-15T12:00:00", 6, [1.8]),
  charge(6, "Anna Anderson", "2026-11-14T12:00:00", 0, []), // failed start: no energy
];

describe("buildYearlyReport", () => {
  const report = buildYearlyReport(transactions, "Anna Anderson", 2026, new Date("2026-12-31T10:00:00Z"));

  it("adds up what the resident has to pay and the energy of that year", () => {
    expect(report.resident_name).toBe("Anna Anderson");
    expect(report.year).toBe(2026);
    expect(report.total_cost).toBeCloseTo(5.85);
    expect(report.total_energy).toBeCloseTo(19.5);
    expect(report.generated).toEqual(new Date("2026-12-31T10:00:00Z"));
  });

  it("lists the charges oldest first, without other residents, other years and failed charges", () => {
    expect(report.sessions.map((session) => session.id)).toEqual([4, 2, 1]);
  });

  it("takes the name of the card, or the card number without a name, and the end of the charge", () => {
    const [october, , november] = report.sessions;

    expect(november).toMatchObject({ card: "Tesla", station: "CP1", energy: 5.5 });
    expect(november.cost).toBeCloseTo(1.65);
    expect(november.ended).toEqual(new Date("2026-11-20T13:30:00Z"));
    expect(october.card).toBe("04AABBCC");
    expect(october.ended).toBeNull();
  });

  it("groups the charges per month, January first", () => {
    expect(report.months.map(({ month, name, sessions }) => [month, name, sessions])).toEqual([
      [10, "October", 1],
      [11, "November", 2],
    ]);
    expect(report.months[1].energy).toBeCloseTo(15.5);
    expect(report.months[1].cost).toBeCloseTo(4.65);
  });

  it("is empty for a resident or year without charges", () => {
    const empty = buildYearlyReport(transactions, "Nobody", 2026);

    expect(empty.sessions).toEqual([]);
    expect(empty.months).toEqual([]);
    expect(empty.total_cost).toBe(0);
  });

  it("works for a name with a hyphen", () => {
    const name = "Anne-Marie de Vries-Jansen";

    expect(buildYearlyReport([charge(1, name, "2026-11-05T12:00:00", 3, [1])], name, 2026).sessions).toHaveLength(1);
  });
});
