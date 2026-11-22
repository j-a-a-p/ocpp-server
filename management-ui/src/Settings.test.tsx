import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const costs = [
  { id: 2, kwh_price: 0.31, kwh_price_dal: 0.3, end_date: null, created: "2026-11-01T08:00:00" },
  { id: 1, kwh_price: 0.25, kwh_price_dal: null, end_date: "2026-10-31", created: "2026-01-01T08:00:00" },
];

const rowsOf = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("Settings", () => {
  it("lists the normaal and dal prices with four decimals and marks the current one", async () => {
    mockFetch({ "GET /charging-costs/": json(costs) });

    renderWithProviders(<Settings />);

    await screen.findByText("€0.3100");
    const rows = rowsOf();
    expect(rows[0].slice(0, 3)).toEqual(["€0.3100", "€0.3000", "Current"]);
    // A price from before the split has no dal price of its own: dal costs the same as normaal.
    expect(rows[1].slice(0, 3)).toEqual(["€0.2500", "€0.2500", "2026-10-31"]);
  });

  it("marks a price that starts after today as a future price, not as current", async () => {
    // The price before it ends on a day in the future, so the new price starts after today.
    const endsInFuture = dayjs().add(4, "day").format("YYYY-MM-DD");
    mockFetch({
      "GET /charging-costs/": json([
        { id: 3, kwh_price: 0.35, kwh_price_dal: 0.34, end_date: null, created: "2026-11-22T08:00:00" },
        { id: 2, kwh_price: 0.31, kwh_price_dal: 0.3, end_date: endsInFuture, created: "2026-11-01T08:00:00" },
      ]),
    });

    renderWithProviders(<Settings />);

    await screen.findByText("€0.3500");
    const rows = rowsOf();
    expect(rows[0].slice(0, 3)).toEqual(["€0.3500", "€0.3400", "Future price"]);
    expect(rows[1].slice(0, 3)).toEqual(["€0.3100", "€0.3000", endsInFuture]);
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("tells the user when the prices cannot be loaded", async () => {
    mockFetch({ "GET /charging-costs/": json({}, 500) });

    renderWithProviders(<Settings />);

    expect(await screen.findByText("Failed to load charging costs.")).toBeInTheDocument();
  });

  it("sends a new price with its start date and reloads the list", async () => {
    const fetchMock = mockFetch({
      "GET /charging-costs/": json(costs),
      "POST /charging-costs/": json({ id: 3, kwh_price: 0.4, kwh_price_dal: 0.39, end_date: null, created: "2026-11-22T08:00:00" }, 201),
    });
    renderWithProviders(<Settings />);
    await screen.findByText("€0.3100");

    await userEvent.click(screen.getByRole("button", { name: /new price/i }));
    await userEvent.type(await screen.findByPlaceholderText("0.3000"), "0.4");
    await userEvent.type(screen.getByPlaceholderText("0.2900"), "0.39");
    await userEvent.type(screen.getByPlaceholderText("Select start date"), "2026-11-22{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Add price" }));

    expect(await screen.findByText("Charging cost added")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ kwh_price: 0.4, kwh_price_dal: 0.39, start_date: "2026-11-22" });
    await waitFor(() => expect(requests(fetchMock).filter((request) => request.startsWith("GET"))).toHaveLength(2));
  });

  it("does not send a price without a value or a date", async () => {
    const fetchMock = mockFetch({ "GET /charging-costs/": json(costs) });
    renderWithProviders(<Settings />);
    await screen.findByText("€0.3100");

    await userEvent.click(screen.getByRole("button", { name: /new price/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Add price" }));

    expect(await screen.findByText("Please enter kWh price")).toBeInTheDocument();
    expect(screen.getByText("Please enter dal kWh price")).toBeInTheDocument();
    expect(screen.getByText("Please select start date")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("shows the reason when the server refuses the price", async () => {
    mockFetch({
      "GET /charging-costs/": json(costs),
      "POST /charging-costs/": json({ detail: "Start date must be after the last end date" }, 400),
    });
    renderWithProviders(<Settings />);
    await screen.findByText("€0.3100");

    await userEvent.click(screen.getByRole("button", { name: /new price/i }));
    await userEvent.type(await screen.findByPlaceholderText("0.3000"), "0.4");
    await userEvent.type(screen.getByPlaceholderText("0.2900"), "0.39");
    await userEvent.type(screen.getByPlaceholderText("Select start date"), "2026-11-22{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Add price" }));

    expect(await screen.findByText("Start date must be after the last end date")).toBeInTheDocument();
  });
});
