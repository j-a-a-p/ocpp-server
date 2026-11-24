import { describe, expect, it } from "vitest";
import type { ChargeTransaction } from "../services/chargeTransactionService";
import { addressKey } from "./address";
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
  street_name: "Hoofdstraat", house_number: "12", house_number_suffix: null, zip_code: "3511 AB", city: "Utrecht",
  total_cost: costs.reduce((sum, cost) => sum + cost, 0),
  ...extra,
});

// Mid-month dates, so the month is the same in every timezone.
const transactions = [
  charge(1, "Anna Anderson", "2026-11-20T12:00:00", 5.5, [1, 0.65], { card_name: "Tesla", ended: "2026-11-20T13:30:00" }),
  charge(2, "Anna Anderson", "2026-11-05T12:00:00", 10, [3]),
  charge(3, "Bob Brown", "2026-11-12T12:00:00", 8, [2.4]), // lives at the same address as Anna
  charge(7, "Carol Clark", "2026-11-13T12:00:00", 9, [2.7], { street_name: "Kerkstraat", house_number: "3" }),
  charge(4, "Anna Anderson", "2026-10-15T12:00:00", 4, [1.2]),
  charge(5, "Anna Anderson", "2025-12-15T12:00:00", 6, [1.8]),
  charge(6, "Anna Anderson", "2026-11-14T12:00:00", 0, []), // failed start: no energy
];

describe("buildYearlyReport", () => {
  const home = addressKey({ street_name: "Hoofdstraat", house_number: "12" });
  const report = buildYearlyReport(transactions, home, 2026, new Date("2026-12-31T10:00:00Z"));

  it("adds up what the address has to pay and the energy of that year", () => {
    expect(report.address).toBe("Hoofdstraat 12");
    expect(report.address_key).toBe(home);
    expect(report.year).toBe(2026);
    expect(report.total_cost).toBeCloseTo(8.25);
    expect(report.total_energy).toBeCloseTo(27.5);
    expect(report.generated).toEqual(new Date("2026-12-31T10:00:00Z"));
  });

  it("names everybody who charged at the address, in order of name", () => {
    expect(report.residents).toEqual(["Anna Anderson", "Bob Brown"]);
  });

  it("lists the charges of everybody at the address oldest first, without other addresses, other years and failed charges", () => {
    expect(report.sessions.map((session) => session.id)).toEqual([4, 2, 3, 1]);
    expect(report.sessions.map((session) => session.resident)).toEqual(["Anna Anderson", "Anna Anderson", "Bob Brown", "Anna Anderson"]);
  });

  it("takes the name of the card, or the card number without a name, and the end of the charge", () => {
    const [october, , , november] = report.sessions;

    expect(november).toMatchObject({ card: "Tesla", station: "CP1", energy: 5.5 });
    expect(november.cost).toBeCloseTo(1.65);
    expect(november.ended).toEqual(new Date("2026-11-20T13:30:00Z"));
    expect(october.card).toBe("04AABBCC");
    expect(october.ended).toBeNull();
  });

  it("groups the charges per month, January first", () => {
    expect(report.months.map(({ month, name, sessions }) => [month, name, sessions])).toEqual([
      [10, "October", 1],
      [11, "November", 3],
    ]);
    expect(report.months[1].energy).toBeCloseTo(23.5);
    expect(report.months[1].cost).toBeCloseTo(7.05);
  });

  it("is the same address whatever the case or the zip code of the resident", () => {
    const other = buildYearlyReport(
      [charge(1, "Eve Ewing", "2026-11-05T12:00:00", 3, [1], { street_name: "HOOFDSTRAAT", zip_code: "9999 ZZ" })],
      home,
      2026,
    );

    expect(other.sessions).toHaveLength(1);
  });

  it("is empty for an address or year without charges", () => {
    const empty = buildYearlyReport(transactions, "nobody", 2026);

    expect(empty.sessions).toEqual([]);
    expect(empty.months).toEqual([]);
    expect(empty.residents).toEqual([]);
    expect(empty.total_cost).toBe(0);
  });

  it("reports the charges of residents without an address together", () => {
    const nowhere = { street_name: null, house_number: null };
    const loose = [
      charge(1, "Dave Dee", "2026-11-05T12:00:00", 3, [1], nowhere),
      charge(2, "Eve Ewing", "2026-11-06T12:00:00", 2, [0.6], nowhere),
    ];

    const result = buildYearlyReport(loose, addressKey({}), 2026);

    expect(result.address).toBe("No address");
    expect(result.sessions).toHaveLength(2);
  });
});
