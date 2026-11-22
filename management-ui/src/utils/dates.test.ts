import { describe, expect, it } from "vitest";
import { formatDuration, parseUtc } from "./dates";

describe("formatDuration", () => {
  it.each([
    [0, "less than a minute"],
    [59, "less than a minute"],
    [-5, "less than a minute"],
    [60, "1 min"],
    [59 * 60 + 59, "59 min"],
    [3600, "1 h"],
    [3 * 3600 + 20 * 60, "3 h 20 min"],
    [24 * 3600, "1 d"],
    [2 * 86400 + 4 * 3600 + 30 * 60, "2 d 4 h"],
    [30 * 86400, "30 d"],
  ])("shows %i seconds as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

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
