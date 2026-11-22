import { describe, expect, it } from "vitest";
import { formatEuro, formatInteger, formatKwh, formatNumber } from "./format";

describe("formatNumber", () => {
  it("uses two decimals and thousands separators", () => {
    expect(formatNumber(0)).toBe("0.00");
    expect(formatNumber(999.994)).toBe("999.99");
    expect(formatNumber(1000)).toBe("1,000.00");
    expect(formatNumber(1234567.891)).toBe("1,234,567.89");
  });

  it("takes the number of decimals", () => {
    expect(formatNumber(1234.5, 1)).toBe("1,234.5");
    expect(formatNumber(0.3, 4)).toBe("0.3000");
    expect(formatNumber(1234.5, 0)).toBe("1,235");
  });

  it("accepts a number as text, which is how the Statistic component hands it over", () => {
    expect(formatNumber("1234.5")).toBe("1,234.50");
  });
});

describe("formatInteger", () => {
  it("has thousands separators and no decimals", () => {
    expect(formatInteger(7)).toBe("7");
    expect(formatInteger(12345)).toBe("12,345");
  });
});

describe("formatEuro", () => {
  it("puts the euro sign in front", () => {
    expect(formatEuro(12.3)).toBe("€12.30");
    expect(formatEuro(1234.5)).toBe("€1,234.50");
  });

  it("takes the number of decimals, for the price per kWh", () => {
    expect(formatEuro(0.31, 4)).toBe("€0.3100");
  });
});

describe("formatKwh", () => {
  it("has the unit behind the number", () => {
    expect(formatKwh(1500)).toBe("1,500.00 kWh");
    expect(formatKwh(12.345, 1)).toBe("12.3 kWh");
  });
});
