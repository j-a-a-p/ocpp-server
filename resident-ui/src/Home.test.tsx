import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { useAuth } from "./contexts/AuthContext";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";
import type { AuthUser } from "./utils/auth";

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
    "GET /charging-costs/active": json({ id: 1, kwh_price: 0.3, kwh_price_dal: 0.29, end_date: null, created: "2026-01-01T00:00:00", current_tariff: "dal", current_kwh_price: 0.29 }),
    "GET /meter_values.json": new Response("", { status: 404 }),
    ...extra,
  });

vi.mock("./contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const logout = vi.fn(async () => {});

const resident: AuthUser = {
  resident_id: 1, email: "anna@example.com", full_name: "Anna", roles: ["resident"], household_head_id: null,
  street_name: "Hoofdstraat", house_number: "12", house_number_suffix: "A", zip_code: "3511 AB", city: "Utrecht",
};

const signedInAs = (user: AuthUser | null) =>
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true, isLoading: false, serverAvailable: true, user, checkAuth: async () => {}, logout });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  logout.mockClear();
  signedInAs(resident);
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

  describe("household members", () => {
    const members = [{ id: 7, full_name: "Bob Brown", email: "bob@example.com", status: "invited", street_name: "Hoofdstraat", house_number: "12", house_number_suffix: "A", zip_code: "3511 AB", city: "Utrecht" }];

    it("lists the household members of a resident", async () => {
      stack({ "GET /residents/household-members": json(members) });

      renderWithProviders(<Home />);

      const card = (await screen.findByText("Household members")).closest(".ant-card") as HTMLElement;
      expect(await within(card).findByText("Bob Brown")).toBeInTheDocument();
      expect(within(card).getByText("bob@example.com")).toBeInTheDocument();
      expect(within(card).getByText("Invited")).toBeInTheDocument();
    });

    it("invites a household member without asking for an address, which is the address of the resident", async () => {
      let list: typeof members = [];
      const fetchMock = stack({
        "GET /residents/household-members": () => json(list),
        "POST /residents/household-members": (_url, init) => {
          list = members;
          return json({ ...members[0], ...JSON.parse(String(init?.body)) });
        },
      });
      renderWithProviders(<Home />);

      await userEvent.click(await screen.findByRole("button", { name: /invite/i }));
      expect(screen.getByText("(Hoofdstraat 12 A, 3511 AB Utrecht)")).toBeInTheDocument();
      expect(screen.queryByLabelText("Street name")).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Full name"), "Bob Brown");
      await userEvent.type(screen.getByLabelText("Email"), "bob@example.com");
      await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

      expect(await screen.findByText("Invitation sent")).toBeInTheDocument();
      expect(await screen.findByText("bob@example.com", { selector: ".ant-typography" })).toBeInTheDocument();
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
      expect(JSON.parse(String(post[1]?.body))).toEqual({ full_name: "Bob Brown", email: "bob@example.com" });
    });

    it("shows the reason when the invitation is refused and keeps the form open", async () => {
      stack({
        "GET /residents/household-members": json([]),
        "POST /residents/household-members": json({ detail: "Resident with this email already exists" }, 400),
      });
      renderWithProviders(<Home />);

      await userEvent.click(await screen.findByRole("button", { name: /invite/i }));
      await userEvent.type(screen.getByLabelText("Full name"), "Bob Brown");
      await userEvent.type(screen.getByLabelText("Email"), "bob@example.com");
      await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

      expect(await screen.findByText("Resident with this email already exists")).toBeInTheDocument();
      expect(screen.getByLabelText("Full name")).toHaveValue("Bob Brown");
    });

    it("cannot invite while the address of the resident is not known", async () => {
      signedInAs({ ...resident, street_name: null, house_number: null, house_number_suffix: null, zip_code: null, city: null });
      stack({ "GET /residents/household-members": json([]) });

      renderWithProviders(<Home />);

      expect(await screen.findByText(/address is not known yet/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /invite/i })).toBeDisabled();
    });

    it("is not offered to a household member, who cannot invite anyone", async () => {
      signedInAs({ ...resident, household_head_id: 3 });
      const fetchMock = stack();

      renderWithProviders(<Home />);

      await screen.findByText("My cards");
      expect(screen.queryByText("Household members")).not.toBeInTheDocument();
      expect(requests(fetchMock).filter((request) => request.includes("household-members"))).toEqual([]);
    });
  });

  it("tells a manager who is not a resident that the account cannot charge, instead of showing the charging pages", async () => {
    signedInAs({ ...resident, roles: ["manager"] });
    const fetchMock = stack();

    renderWithProviders(<Home />);

    expect(await screen.findByText("Your account cannot charge")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "management portal" })).toHaveAttribute("href", "/management-ui/");
    expect(screen.queryByText("My cards")).not.toBeInTheDocument();
    // Only the station status file, which is not an API call.
    expect(requests(fetchMock).filter((request) => !request.includes("meter_values.json"))).toEqual([]);
  });

  it("logs the resident out with the button in the header", async () => {
    stack();
    renderWithProviders(<Home />);

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it("tells the resident when logging out fails", async () => {
    stack();
    logout.mockRejectedValueOnce(new Error("Logout failed: 500"));
    renderWithProviders(<Home />);

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByText("Failed to log out")).toBeInTheDocument();
  });

  it("tells the resident when the sessions cannot be loaded", async () => {
    stack({ "GET /charge-transactions/my-transactions": json({}, 500) });

    renderWithProviders(<Home />);

    expect(await screen.findByText("Failed to load your charging sessions")).toBeInTheDocument();
    expect(screen.getByText("No charging sessions yet")).toBeInTheDocument();
  });

  describe("residency lifecycle states", () => {
    it("shows a welcome landing page before the residency start date explaining the product and when charging starts", async () => {
      signedInAs({
        ...resident,
        is_main_member: true,
        residency_start_date: "2026-07-01",
        residency_end_date: null,
        residency_state: "upcoming",
      });
      const fetchMock = stack({ "GET /residents/household-members": json([]) });

      renderWithProviders(<Home />);

      expect(await screen.findByText("Welcome to Charger, Anna")).toBeInTheDocument();
      expect(screen.getByText("Charging starts on 1 July 2026")).toBeInTheDocument();
      expect(screen.getByText("1. Register your charging card")).toBeInTheDocument();
      expect(screen.getByText("2. Charge with clear rates")).toBeInTheDocument();
      expect(screen.getByText("3. Household & billing")).toBeInTheDocument();
      // Main member can already invite household members ahead of move-in, but live charging endpoints are skipped.
      expect(await screen.findByText("Household members")).toBeInTheDocument();
      expect(screen.queryByText("My cards")).not.toBeInTheDocument();
      expect(requests(fetchMock).filter((r) => r.includes("/charge-transactions/") || r.includes("/cards/"))).toEqual([]);
    });

    it("shows an ending notice banner when a future end date is set", async () => {
      signedInAs({
        ...resident,
        residency_start_date: "2026-01-01",
        residency_end_date: "2026-12-31",
        residency_state: "active",
      });
      stack({ "GET /residents/household-members": json([]) });

      renderWithProviders(<Home />);

      expect(await screen.findByText("Your residency ends on 31 December 2026")).toBeInTheDocument();
    });

    it("switches to a read-only view after the residency end date, preserving history and cards without write actions", async () => {
      signedInAs({
        ...resident,
        is_main_member: true,
        residency_start_date: "2025-01-01",
        residency_end_date: "2026-06-30",
        residency_state: "ended",
      });
      const fetchMock = stack();

      renderWithProviders(<Home />);

      expect(await screen.findByText("Your residency ended on 30 June 2026")).toBeInTheDocument();
      expect(await screen.findByText("19.5")).toBeInTheDocument();
      expect(await screen.findByText("04AABBCC")).toBeInTheDocument();
      expect(screen.queryByText("Refused at CP1")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /rename card/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Household members")).not.toBeInTheDocument();
      expect(requests(fetchMock).filter((r) => r.includes("/cards/refused") || r.includes("household-members"))).toEqual([]);
    });
  });
});
