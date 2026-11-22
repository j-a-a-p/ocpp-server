import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { json, mockFetch } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const log = (delta_power_cost: number) => ({ id: 1, delta_power_cost, kwh_rate: 0.3 });

const charges = [
  { id: 3, station_id: "CP1", rfid: "A", created: "2026-11-20T09:00:00", final_energy_kwh: 4, resident_name: "Anna", power_logs: [log(1.2)] },
  { id: 2, station_id: "CP1", rfid: "A", created: "2026-11-15T10:30:00", final_energy_kwh: 12, resident_name: "Bob", power_logs: [log(1.5), log(2.1)] },
  { id: 1, station_id: "CP1", rfid: "B", created: "2026-10-02T09:00:00", final_energy_kwh: 0, resident_name: "Bob", power_logs: [] }, // failed start
];

const meter = (timestamp: string, extra: object = {}) =>
  json({
    timestamp, connectorId: 1, transactionId: 3, context: "Sample.Periodic",
    data: { "Power.Active.Import": 7.234, "Energy.Active.Import.Register": 12.5 },
    ...extra,
  });

const stack = (routes: Parameters<typeof mockFetch>[0] = {}) =>
  mockFetch({
    "GET /charge-transactions/all": json(charges),
    "GET /meter_values.json": new Response("", { status: 404 }),
    ...routes,
  });

// Ant Design splits a value like 7.23 into separate elements for the whole and decimal part,
// so a tile is checked by the text of the whole Statistic.
const tile = async (title: string) => (await screen.findByText(title)).closest("div.ant-statistic") as HTMLElement;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Dashboard: charge summary", () => {
  it("adds up the charges that delivered energy", async () => {
    stack();

    renderWithProviders(<Dashboard />);

    await expect.poll(async () => (await tile("Total energy")).textContent).toContain("16.00kWh");
    expect(await tile("Charging sessions")).toHaveTextContent("2");
    expect(await tile("Total cost")).toHaveTextContent("€4.80");
    expect(await tile("Average per session")).toHaveTextContent("8.00kWh");
  });

  it("shows zeros without charges", async () => {
    stack({ "GET /charge-transactions/all": json([]) });

    renderWithProviders(<Dashboard />);

    await expect.poll(async () => (await tile("Total cost")).textContent).toContain("€0.00");
    expect(await tile("Average per session")).toHaveTextContent("0.00kWh");
  });

  it("tells the user when the charges cannot be loaded", async () => {
    stack({ "GET /charge-transactions/all": json({}, 500) });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Failed to load charge transactions.")).toBeInTheDocument();
  });
});

describe("Dashboard: charger status", () => {
  it("is charging when the last reading is fresh, with power, energy and the profile", async () => {
    stack({ "GET /meter_values.json": meter(new Date().toISOString(), { chargingProfile: { name: "max_power", currentMaxPower: 16 } }) });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Charging")).toBeInTheDocument();
    expect(await tile("Current power")).toHaveTextContent("7.23kW");
    expect(await tile("Energy imported")).toHaveTextContent("12.50kWh");
    expect(screen.getByText("max_power")).toBeInTheDocument();
    expect(screen.getByText("16.0 A")).toBeInTheDocument();
  });

  it("is available with zero power when the last reading is old", async () => {
    stack({ "GET /meter_values.json": meter(new Date(Date.now() - 5 * 60 * 1000).toISOString()) });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(await tile("Current power")).toHaveTextContent("0.00kW");
    expect(await tile("Energy imported")).toHaveTextContent("12.50kWh");
  });

  it("is unknown without data from the charger", async () => {
    stack();

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("There is no data from the charger.")).toBeInTheDocument();
  });
});
