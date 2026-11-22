import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const log = (id: number, energy_kwh: number, delta_power_cost: number) => ({
  id, charge_transaction_id: 1, power_kw: 7, energy_kwh, created: "2026-11-15T10:30:00", delta_power_cost, kwh_rate: 0.3,
});

// Newest first, like the API. Two sessions in November, one in October.
const charges = [
  { id: 3, station_id: "CP2", rfid: "04AABBCC", card_name: "Tesla", created: "2026-11-20T09:00:00", final_energy_kwh: 4, power_logs: [log(5, 4, 1.2)] },
  { id: 2, station_id: "CP1", rfid: "04AABBCC", card_name: "Tesla", created: "2026-11-15T10:30:00", final_energy_kwh: 12.5, power_logs: [log(3, 5, 1.5), log(4, 12.5, 2.25)] },
  { id: 1, station_id: "CP1", rfid: "04DDEEFF", card_name: "Visitor", created: "2026-10-02T09:00:00", final_energy_kwh: 3, power_logs: [log(1, 3, 0.9)] },
];

const myCards = [
  { rfid: "04AABBCC", name: "Tesla", resident_id: 1 },
  { rfid: "04DDEEFF", name: "Visitor", resident_id: 1 },
];

const refused = { id: 9, rfid: "DEADBEEF", station_id: "CP1", created: "2026-11-22T08:00:00" };

const stack = (extra: Parameters<typeof mockFetch>[0] = {}) =>
  mockFetch({
    "GET /charge-transactions/my-transactions": json(charges),
    "GET /cards/my_cards": json({ cards: myCards }),
    "GET /cards/refused": json({ detail: "No refused cards found" }, 404),
    "GET /charging-costs/active": json({ id: 1, kwh_price: 0.3, end_date: null, created: "2026-01-01T00:00:00" }),
    "GET /meter_values.json": new Response("", { status: 404 }),
    ...extra,
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Home (the resident portal)", () => {
  it("shows the totals of all sessions", async () => {
    stack();

    renderWithProviders(<Home />);

    // 4 + 12.5 + 3 kWh and 1.2 + 3.75 + 0.9 euro
    expect(await screen.findByText("19.5")).toBeInTheDocument();
    expect(screen.getByText("€5.85")).toBeInTheDocument();
    expect(screen.getByText("Resident portal")).toBeInTheDocument();
  });

  it("shows the usage per month, newest first", async () => {
    stack();

    renderWithProviders(<Home />);

    const november = await screen.findByText("November '26");
    const table = november.closest("table") as HTMLElement;
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("November '26")).toBeInTheDocument();
    expect(within(rows[0]).getByText("16.5 kWh")).toBeInTheDocument();
    expect(within(rows[0]).getByText("€4.95")).toBeInTheDocument();
    expect(within(rows[1]).getByText("October '26")).toBeInTheDocument();
    expect(within(rows[1]).getByText("3.0 kWh")).toBeInTheDocument();
  });

  it("lists every session with the card, station, energy and cost", async () => {
    stack();

    renderWithProviders(<Home />);

    const station = await screen.findByText("CP2");
    const row = station.closest("tr") as HTMLElement;
    expect(within(row).getByText("Tesla")).toBeInTheDocument();
    expect(within(row).getByText("4.0 kWh")).toBeInTheDocument();
    expect(within(row).getByText("€1.20")).toBeInTheDocument();
  });

  it("offers a chart only for sessions with more than one power log", async () => {
    stack();

    renderWithProviders(<Home />);

    await screen.findByText("CP2");
    expect(screen.getAllByRole("button", { name: "Show chart" })).toHaveLength(1);
  });

  it("shows the cards of the resident", async () => {
    stack();

    renderWithProviders(<Home />);

    const heading = await screen.findByText("My cards");
    const card = heading.closest(".ant-card") as HTMLElement;
    expect(await within(card).findByText("04AABBCC")).toBeInTheDocument();
    expect(within(card).getByText("04DDEEFF")).toBeInTheDocument();
  });

  it("shows the rate and that the charger status is unknown without data", async () => {
    stack();

    renderWithProviders(<Home />);

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("There is no recent data from the charger.")).toBeInTheDocument();
  });

  it("adds a refused card to the account and refreshes the lists", async () => {
    let added = false;
    const fetchMock = stack({
      "GET /cards/refused": () => (added ? json({ detail: "none" }, 404) : json({ refused_cards: [refused] })),
      "POST /cards/add_card/CP1": () => {
        added = true;
        return json({ rfid: "DEADBEEF", name: "DEADBEEF", resident_id: 1 });
      },
    });
    renderWithProviders(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: /add as my card/i }));
    const confirm = await screen.findByText("Add this card?");
    await userEvent.click(within(confirm.closest(".ant-popover") as HTMLElement).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("Card added to your account")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([expect.stringMatching(/\/cards\/add_card\/CP1$/)]);
    await waitFor(() => expect(screen.queryByText("Refused at CP1")).not.toBeInTheDocument());
    expect(requests(fetchMock).filter((request) => request.includes("/cards/my_cards"))).toHaveLength(2);
  });

  it("tells the resident when the sessions cannot be loaded", async () => {
    stack({ "GET /charge-transactions/my-transactions": json({}, 500) });

    renderWithProviders(<Home />);

    expect(await screen.findByText("Failed to load your charging sessions")).toBeInTheDocument();
    expect(screen.getByText("No charging sessions yet")).toBeInTheDocument();
  });
});
