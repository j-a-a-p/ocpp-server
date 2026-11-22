import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "../test/mockFetch";
import { useStationStatus } from "./useStationStatus";

const meter = (timestamp: string, transactionId = 12) =>
  json({ timestamp, connectorId: 1, transactionId, context: "Sample.Periodic", data: { "Power.Active.Import": 7, "Energy.Active.Import.Register": 3 } });

const myCharges = (...ids: number[]) =>
  json(ids.map((id) => ({ id, station_id: "CP1", rfid: "04AABBCC", created: "2026-11-22T08:00:00", final_energy_kwh: 1, power_logs: [] })));

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const readStation = async () => {
  const { result } = renderHook(() => useStationStatus(60_000));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  return result.current;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("useStationStatus", () => {
  it("starts as unknown and not loaded", () => {
    mockFetch({ "GET /meter_values.json": new Response("", { status: 404 }) });

    const { result } = renderHook(() => useStationStatus(60_000));

    expect(result.current).toMatchObject({ state: "unknown", loaded: false, meterValues: null });
  });

  it("is unknown when the charger has published nothing", async () => {
    mockFetch({ "GET /meter_values.json": new Response("", { status: 404 }) });

    expect(await readStation()).toMatchObject({ state: "unknown", meterValues: null, loaded: true });
  });

  it("is unknown when the file cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect((await readStation()).state).toBe("unknown");
  });

  it("is available when the last reading is older than two minutes", async () => {
    mockFetch({ "GET /meter_values.json": meter(secondsAgo(180)) });

    const station = await readStation();

    expect(station.state).toBe("available");
    expect(station.meterValues?.transactionId).toBe(12);
    expect(station.lastUpdate).toBeInstanceOf(Date);
  });

  it("is mine when a fresh reading belongs to one of my charges", async () => {
    mockFetch({
      "GET /meter_values.json": meter(secondsAgo(10), 12),
      "GET /charge-transactions/my-transactions": myCharges(11, 12),
    });

    expect((await readStation()).state).toBe("mine");
  });

  it("is other when a fresh reading belongs to someone else", async () => {
    mockFetch({
      "GET /meter_values.json": meter(secondsAgo(10), 99),
      "GET /charge-transactions/my-transactions": myCharges(11, 12),
    });

    expect((await readStation()).state).toBe("other");
  });

  it("is other when my own charges cannot be loaded", async () => {
    mockFetch({
      "GET /meter_values.json": meter(secondsAgo(10), 12),
      "GET /charge-transactions/my-transactions": json({}, 500),
    });

    expect((await readStation()).state).toBe("other");
  });

  it("asks for a fresh copy of the file, not the cached one", async () => {
    const fetchMock = mockFetch({ "GET /meter_values.json": meter(secondsAgo(180)) });

    await readStation();

    expect(fetchMock.mock.calls[0]).toEqual(["/meter_values.json", { cache: "no-store" }]);
  });
});
