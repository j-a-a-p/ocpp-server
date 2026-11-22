import { describe, expect, it } from "vitest";
import type { ChargeTransaction } from "../services/chargeTransactionService";
import { formatEuro, formatInteger, formatKwh, formatNumber, transactionCost } from "./format";

const transaction = (costs: Array<number | undefined> | undefined): ChargeTransaction => ({
  id: 1,
  station_id: "CP1",
  rfid: "04AABBCC",
  created: "2026-11-20T10:00:00",
  final_energy_kwh: 5,
  power_logs: costs?.map((delta_power_cost, index) => ({
    id: index,
    charge_transaction_id: 1,
    power_kw: 7,
    energy_kwh: index + 1,
    created: "2026-11-20T10:00:00",
    delta_power_cost,
  })) as ChargeTransaction["power_logs"],
});

describe("thousands separators", () => {
  it("are in every format", () => {
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
    expect(formatNumber("1234.5", 1)).toBe("1,234.5");
    expect(formatInteger(12345)).toBe("12,345");
    expect(formatEuro(1234.5)).toBe("€1,234.50");
    expect(formatKwh(12345.67)).toBe("12,345.7 kWh");
  });
});

describe("formatEuro", () => {
  it("shows two decimals with the euro sign", () => {
    expect(formatEuro(0)).toBe("€0.00");
    expect(formatEuro(12.3)).toBe("€12.30");
    expect(formatEuro(0.3)).toBe("€0.30");
  });

  it("rounds to cents", () => {
    expect(formatEuro(1.006)).toBe("€1.01");
  });
});

describe("formatKwh", () => {
  it("uses one decimal by default", () => {
    expect(formatKwh(12.34)).toBe("12.3 kWh");
  });

  it("takes the number of decimals", () => {
    expect(formatKwh(12.345, 2)).toBe("12.35 kWh");
  });
});

describe("transactionCost", () => {
  it("adds the cost of every power log", () => {
    expect(transactionCost(transaction([0.3, 0.6, 0.9]))).toBeCloseTo(1.8);
  });

  it("counts missing costs as zero", () => {
    expect(transactionCost(transaction([0.3, undefined]))).toBeCloseTo(0.3);
  });

  it("is zero without power logs", () => {
    expect(transactionCost(transaction([]))).toBe(0);
    expect(transactionCost(transaction(undefined))).toBe(0);
  });
});
