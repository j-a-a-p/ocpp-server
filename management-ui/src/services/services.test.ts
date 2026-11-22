import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "../test/mockFetch";
import { getAllChargeTransactions } from "./chargeTransactionService";
import { chargingCostService } from "./chargingCostService";
import { chargingProfileService } from "./chargingProfileService";
import { getPowerLogAnalytics } from "./powerLogService";
import { getStations } from "./stationService";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("getAllChargeTransactions", () => {
  it("reads every charge with the cookie", async () => {
    const fetchMock = mockFetch({ "GET /charge-transactions/all": json([{ id: 1 }]) });

    expect(await getAllChargeTransactions()).toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("fails with the status of the response", async () => {
    mockFetch({ "GET /charge-transactions/all": json({}, 401) });

    await expect(getAllChargeTransactions()).rejects.toThrow("HTTP error! status: 401");
  });
});

describe("getStations", () => {
  it("reads the stations of the window with the cookie", async () => {
    const overview = { generated_at: "2026-11-22T12:00:00Z", window_start: "2026-11-21T12:00:00Z", window_hours: 24, online_count: 0, stations: [] };
    const fetchMock = mockFetch({ "GET /stations/": json(overview) });

    expect(await getStations(24)).toEqual(overview);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/stations\/\?hours=24$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("fails on an error", async () => {
    mockFetch({ "GET /stations/": json({}, 401) });

    await expect(getStations(24)).rejects.toThrow("Failed to fetch stations");
  });
});

describe("getPowerLogAnalytics", () => {
  it("reads the analytics with the cookie", async () => {
    const analytics = { current_year_summary: {}, monthly_data: [], hourly_by_year: [] };
    const fetchMock = mockFetch({ "GET /power-logs/analytics": json(analytics) });

    expect(await getPowerLogAnalytics()).toEqual(analytics);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/power-logs\/analytics$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("fails on an error", async () => {
    mockFetch({ "GET /power-logs/analytics": json({}, 500) });

    await expect(getPowerLogAnalytics()).rejects.toThrow("Failed to fetch PowerLog data");
  });
});

describe("chargingCostService", () => {
  it("lists the prices", async () => {
    mockFetch({ "GET /charging-costs/": json([{ id: 1, kwh_price: 0.3, end_date: null, created: "2026-01-01T00:00:00" }]) });

    expect(await chargingCostService.getAllChargingCosts()).toHaveLength(1);
  });

  it("reads the active price", async () => {
    mockFetch({ "GET /charging-costs/active": json({ id: 1, kwh_price: 0.3 }) });

    expect((await chargingCostService.getActiveChargingCost()).kwh_price).toBe(0.3);
  });

  it("creates a price", async () => {
    const fetchMock = mockFetch({ "POST /charging-costs/": json({ id: 2, kwh_price: 0.45 }) });

    await chargingCostService.createChargingCost({ kwh_price: 0.45, kwh_price_dal: 0.44, start_date: "2026-12-01" });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ kwh_price: 0.45, kwh_price_dal: 0.44, start_date: "2026-12-01" }),
    });
  });

  it("fails with the reason of the API", async () => {
    mockFetch({ "POST /charging-costs/": json({ detail: "kWh price must be positive" }, 400) });

    await expect(chargingCostService.createChargingCost({ kwh_price: 0, start_date: "2026-12-01" })).rejects.toThrow(
      "kWh price must be positive"
    );
  });

  it("fails with a general message when the API gives no reason", async () => {
    mockFetch({ "POST /charging-costs/": new Response("oops", { status: 500 }) });

    await expect(chargingCostService.createChargingCost({ kwh_price: 1, start_date: "2026-12-01" })).rejects.toThrow(
      "Failed to create charging cost"
    );
  });
});

describe("chargingProfileService", () => {
  const profile = { id: 4, name: "Night", profile_type: "max_current", status: "Draft", max_current: 16, created_at: "x", updated_at: "x" };

  it("lists the profiles", async () => {
    mockFetch({ "GET /charging-profiles/": json([profile]) });

    expect(await chargingProfileService.getProfiles()).toEqual([profile]);
  });

  it("creates a profile", async () => {
    const fetchMock = mockFetch({ "POST /charging-profiles/": json(profile) });

    await chargingProfileService.createProfile({ name: "Night", profile_type: "max_current", max_current: 16 });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "Night", profile_type: "max_current", max_current: 16 }),
    });
  });

  it("fails with the reason of the API when creating", async () => {
    mockFetch({ "POST /charging-profiles/": json({ detail: "max_current is required for max_current profile type" }, 400) });

    await expect(chargingProfileService.createProfile({ name: "x", profile_type: "max_current" })).rejects.toThrow(
      "max_current is required"
    );
  });

  it("updates a profile", async () => {
    const fetchMock = mockFetch({ "PUT /charging-profiles/4": json(profile) });

    await chargingProfileService.updateProfile(4, { name: "Day" });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ name: "Day" }) });
  });

  it("returns the profile from the answer when inactivating and reactivating", async () => {
    mockFetch({
      "PUT /charging-profiles/4/inactivate": json({ message: "ok", profile: { ...profile, status: "Inactive" } }),
      "PUT /charging-profiles/4/reactivate": json({ message: "ok", profile: { ...profile, status: "Draft" } }),
    });

    expect((await chargingProfileService.inactivateProfile(4)).status).toBe("Inactive");
    expect((await chargingProfileService.reactivateProfile(4)).status).toBe("Draft");
  });

  it("fails when inactivating an unknown profile", async () => {
    mockFetch({ "PUT /charging-profiles/9/inactivate": json({}, 404) });

    await expect(chargingProfileService.inactivateProfile(9)).rejects.toThrow("Failed to inactivate charging profile");
  });

  it("reads the available types", async () => {
    mockFetch({ "GET /charging-profiles/types/available": json({ profile_types: [{ value: "max_current", label: "Max Current", description: "", fields: ["max_current"] }] }) });

    expect((await chargingProfileService.getAvailableProfileTypes()).profile_types[0].fields).toEqual(["max_current"]);
  });
});
