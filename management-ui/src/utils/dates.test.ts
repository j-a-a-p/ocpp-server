import { describe, expect, it } from "vitest";
import { parseUtc } from "./dates";

describe("parseUtc", () => {
  it("reads a timestamp without a timezone as UTC, like the API sends them", () => {
    expect(parseUtc("2026-11-22T08:51:30").toISOString()).toBe("2026-11-22T08:51:30.000Z");
  });

  it("reads fractional seconds too", () => {
    expect(parseUtc("2026-11-22T08:51:30.123456").toISOString()).toBe("2026-11-22T08:51:30.123Z");
  });

  it("keeps a timestamp that already says Z", () => {
    expect(parseUtc("2026-11-22T08:51:30Z").toISOString()).toBe("2026-11-22T08:51:30.000Z");
  });

  it("keeps an explicit offset", () => {
    expect(parseUtc("2026-11-22T09:51:30+01:00").toISOString()).toBe("2026-11-22T08:51:30.000Z");
    expect(parseUtc("2026-11-22T03:51:30-0500").toISOString()).toBe("2026-11-22T08:51:30.000Z");
  });

  it("leaves a date without a time alone", () => {
    expect(parseUtc("2026-11-22").toISOString()).toBe("2026-11-22T00:00:00.000Z");
  });
});
