import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Residents from "./Residents";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const address = (
  street_name: string | null,
  house_number: string | null = null,
  house_number_suffix: string | null = null,
  zip_code: string | null = "3511 AB",
  city: string | null = "Utrecht",
) => ({ street_name, house_number, house_number_suffix, zip_code: street_name ? zip_code : null, city: street_name ? city : null });

const residents = [
  {
    id: 1, full_name: "Anna Anderson", email: "anna@example.com", status: "active",
    roles: ["manager", "resident"], household_id: 10, is_main_member: true, household_head_id: null,
    residency_start_date: "2026-01-01", residency_end_date: null, residency_state: "active" as const,
    ...address("Hoofdstraat", "12"),
  },
  {
    id: 2, full_name: "Bob Brown", email: "bob@example.com", status: "invited",
    roles: ["resident"], household_id: 20, is_main_member: true, household_head_id: null,
    residency_start_date: "2026-01-01", residency_end_date: null, residency_state: "active" as const,
    ...address("Kerkstraat", "3", "A"),
  },
];

const addressOptions = [
  { street_name: "Hoofdstraat", house_number: "12", house_number_suffix: null, zip_code: "3511 AB", city: "Utrecht" },
  { street_name: "Hoofdstraat", house_number: "12", house_number_suffix: "A", zip_code: "3511 AB", city: "Utrecht" },
  { street_name: "Kerkstraat", house_number: "3", house_number_suffix: null, zip_code: "3512 CD", city: "Utrecht" },
];

const cards = [
  { rfid: "04AABBCC", name: "Tesla", resident_id: 1, enabled: true },
  { rfid: "04DDEEFF", name: "Old fob", resident_id: 1, enabled: false },
  { rfid: "04112233", name: "Golf", resident_id: 2, enabled: true },
];

const routes = (list: unknown = residents, cardList: unknown = cards) => ({
  "GET /residents/address-options": json(addressOptions),
  "GET /cards/": () => json(cardList),
  "GET /residents/": () => json(list),
});

const lastBody = (fetchMock: ReturnType<typeof mockFetch>, method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)!;
  return JSON.parse(String(call[1]?.body));
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Residents", () => {
  it("lists the residents with their email address, roles and status", async () => {
    mockFetch(routes());

    renderWithProviders(<Residents />);

    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;
    expect(within(anna).getByText("anna@example.com")).toBeInTheDocument();
    expect(within(anna).getByText("Active")).toBeInTheDocument();
    expect(within(anna).getByText("Manager")).toBeInTheDocument();
    expect(within(anna).getByText("Main member")).toBeInTheDocument();
    expect(within(anna).getByText("AA")).toBeInTheDocument();
    const bob = screen.getByText("Bob Brown").closest("tr") as HTMLElement;
    expect(within(bob).getByText("Invited")).toBeInTheDocument();
    expect(within(bob).queryByText("Manager")).not.toBeInTheDocument();
    expect(screen.getByText("2 residents")).toBeInTheDocument();
  });

  it("understands a status in capitals too", async () => {
    mockFetch(routes([{ ...residents[0], status: "ACTIVE" }]));

    renderWithProviders(<Residents />);

    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("groups the residents by address, in order, and puts accounts without an address last", async () => {
    mockFetch(
      routes([
        { ...residents[1], id: 5, full_name: "Carol Clark", household_id: 50, ...address("Kerkstraat", "10") },
        { ...residents[1], id: 4, full_name: "Dave Dunn", roles: ["manager"], household_id: null, is_main_member: false, ...address(null) },
        { ...residents[1], id: 3, full_name: "Eve Evans", household_id: 10, is_main_member: false, household_head_id: 1, ...address("Hoofdstraat", "12") },
        residents[0],
        { ...residents[1], id: 6, full_name: "Bob Brown", household_id: 20, ...address("Kerkstraat", "3", "A") },
      ])
    );

    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    const headings = ["Hoofdstraat 12", "Kerkstraat 3 A", "Kerkstraat 10", "No address"];
    const rows = Array.from(document.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    const positions = headings.map((heading) => rows.findIndex((row) => row.startsWith(heading)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // The resident first, then the household member, both under their address.
    const hoofdstraat = positions[0];
    expect(rows[hoofdstraat]).toContain("2 people");
    expect(rows[hoofdstraat + 1]).toContain("Anna Anderson");
    expect(rows[hoofdstraat + 2]).toContain("Eve Evans");
    expect(within(screen.getByText("Eve Evans").closest("tr") as HTMLElement).getByText("Household member")).toBeInTheDocument();
    expect(rows[positions[3] + 1]).toContain("Dave Dunn");
  });

  it("invites a new resident with an address", async () => {
    let list = residents;
    const fetchMock = mockFetch({
      ...routes(),
      "GET /residents/": () => json(list),
      "POST /residents/": (_url, init) => {
        const created = {
          id: 3, status: "invited", household_id: 30, is_main_member: true, household_head_id: null,
          residency_end_date: null, residency_state: "active", ...JSON.parse(String(init?.body)),
        };
        list = [...residents, created];
        return json(created);
      },
    });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Full name"), "Carol Clark");
    await userEvent.type(screen.getByLabelText("Email"), "carol@example.com");
    await userEvent.type(screen.getByLabelText("Street name"), "Dorpsweg");
    await userEvent.type(screen.getByLabelText("House number"), "7");
    await userEvent.type(screen.getByLabelText("Suffix"), "b");
    await userEvent.type(screen.getByLabelText("Zip code"), "3511 AB");
    await userEvent.type(screen.getByLabelText("City"), "Utrecht");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Resident invited")).toBeInTheDocument();
    expect(await screen.findByText("Carol Clark")).toBeInTheDocument();
    expect(screen.getByText("Dorpsweg 7 b")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(lastBody(fetchMock, "POST")).toEqual({
      full_name: "Carol Clark",
      email: "carol@example.com",
      roles: ["resident"],
      street_name: "Dorpsweg",
      house_number: "7",
      house_number_suffix: "b",
      zip_code: "3511 AB",
      city: "Utrecht",
      residency_start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(post[1]).toMatchObject({ credentials: "include" });
  });

  it("suggests the streets in use and, once a street is chosen, only the numbers on that street", async () => {
    mockFetch(routes());
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");
    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));

    await userEvent.click(screen.getByLabelText("Street name"));
    const streets = Array.from(document.querySelectorAll(".ant-select-item-option")).map((option) => option.textContent);
    expect(streets).toEqual(["Hoofdstraat", "Kerkstraat"]);

    await userEvent.type(screen.getByLabelText("Street name"), "Kerkstraat");
    await userEvent.click(screen.getByLabelText("House number"));
    await waitFor(() => {
      const numbers = Array.from(document.querySelectorAll(".ant-select-item-option")).map((option) => option.textContent);
      // The dropdown of the street field may still be fading out, so look for what is there and what is not.
      expect(numbers).toContain("3");
      expect(numbers).not.toContain("12");
    });
  });

  it("only asks for an address when the account is a resident", async () => {
    const fetchMock = mockFetch({ ...routes(), "POST /residents/": json({ id: 9 }) });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");
    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    expect(screen.getByLabelText("Street name")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /resident/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /manager/i }));
    expect(screen.queryByLabelText("Street name")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Full name"), "Dave Dunn");
    await userEvent.type(screen.getByLabelText("Email"), "dave@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    await screen.findByText("Resident invited");
    expect(lastBody(fetchMock, "POST")).toEqual({ full_name: "Dave Dunn", email: "dave@example.com", roles: ["manager"] });
  });

  it("does not send an incomplete form", async () => {
    const fetchMock = mockFetch(routes());
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Please enter full name")).toBeInTheDocument();
    expect(await screen.findByText("Please enter a valid email")).toBeInTheDocument();
    expect(await screen.findByText("Please enter street name")).toBeInTheDocument();
    expect(await screen.findByText("Please enter house number")).toBeInTheDocument();
    expect(await screen.findByText("Please enter zip code")).toBeInTheDocument();
    expect(await screen.findByText("Please enter city")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("needs at least one role", async () => {
    const fetchMock = mockFetch(routes());
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");
    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));

    await userEvent.click(screen.getByRole("checkbox", { name: /resident/i }));
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Choose at least one role")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("shows the reason when the API refuses the resident", async () => {
    mockFetch({
      ...routes(),
      "POST /residents/": json({ detail: "Resident with this email already exists" }, 400),
    });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Full name"), "Anna Again");
    await userEvent.type(screen.getByLabelText("Email"), "anna@example.com");
    await userEvent.type(screen.getByLabelText("Street name"), "Hoofdstraat");
    await userEvent.type(screen.getByLabelText("House number"), "12");
    await userEvent.type(screen.getByLabelText("Zip code"), "3511 AB");
    await userEvent.type(screen.getByLabelText("City"), "Utrecht");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Resident with this email already exists")).toBeInTheDocument();
  });

  it("edits a resident and shows why the last manager cannot lose the role", async () => {
    const fetchMock = mockFetch({
      ...routes(),
      "PUT /residents/1": json({ detail: "There must always be at least one manager" }, 409),
    });
    renderWithProviders(<Residents />);
    const row = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;

    await userEvent.click(within(row).getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Street name")).toHaveValue("Hoofdstraat");
    await userEvent.click(screen.getByRole("checkbox", { name: /manager/i }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("There must always be at least one manager")).toBeInTheDocument();
    expect(lastBody(fetchMock, "PUT")).toEqual({
      full_name: "Anna Anderson",
      roles: ["resident"],
      street_name: "Hoofdstraat",
      house_number: "12",
      house_number_suffix: null,
      zip_code: "3511 AB",
      city: "Utrecht",
      residency_start_date: "2026-01-01",
    });
  });

  it("shows how many cards each resident has below their name, and how many are disabled", async () => {
    mockFetch(routes());

    renderWithProviders(<Residents />);

    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;
    expect(await within(anna).findByRole("button", { name: /2 cards, 1 disabled/ })).toBeInTheDocument();
    const bob = screen.getByText("Bob Brown").closest("tr") as HTMLElement;
    expect(within(bob).getByRole("button", { name: /1 card$/ })).toBeInTheDocument();
    // The cards themselves are in the dialog, not in the list.
    expect(screen.queryByText("Tesla")).not.toBeInTheDocument();
  });

  it("shows nothing for a resident who has no cards", async () => {
    mockFetch(routes(residents, []));

    renderWithProviders(<Residents />);

    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;
    expect(within(anna).queryByRole("button", { name: /card/ })).not.toBeInTheDocument();
  });

  const openCardsOfAnna = async () => {
    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;
    await userEvent.click(await within(anna).findByRole("button", { name: /2 cards/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cards of Anna Anderson")).toBeInTheDocument();
    return dialog;
  };

  it("opens the cards of the resident in a dialog, with the disabled one marked", async () => {
    mockFetch(routes());
    renderWithProviders(<Residents />);

    const dialog = await openCardsOfAnna();

    expect(within(dialog).getByText("Tesla")).toBeInTheDocument();
    expect(within(dialog).getByText("04AABBCC")).toBeInTheDocument();
    expect(within(dialog).getByText("Old fob")).toBeInTheDocument();
    expect(within(dialog).getByText("Disabled")).toBeInTheDocument();
    expect(within(dialog).queryByText("Golf")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "Card Tesla enabled" })).toBeChecked();
    expect(within(dialog).getByRole("switch", { name: "Card Old fob enabled" })).not.toBeChecked();
  });

  it("lets a manager disable a card in the dialog", async () => {
    const fetchMock = mockFetch({ ...routes(), "PUT /cards/04AABBCC/enabled": json({ rfid: "04AABBCC", enabled: false }) });
    renderWithProviders(<Residents />);
    const dialog = await openCardsOfAnna();

    await userEvent.click(within(dialog).getByRole("switch", { name: "Card Tesla enabled" }));

    expect(await screen.findByText("Card Tesla disabled")).toBeInTheDocument();
    expect(lastBody(fetchMock, "PUT")).toEqual({ enabled: false });
    expect(within(dialog).getByRole("switch", { name: "Card Tesla enabled" })).not.toBeChecked();
    expect(within(dialog).getAllByText("Disabled")).toHaveLength(2);
    // The count in the list follows.
    expect(screen.getByRole("button", { name: /2 cards, 2 disabled/ })).toBeInTheDocument();
  });

  it("lets a manager enable a card again", async () => {
    const fetchMock = mockFetch({ ...routes(), "PUT /cards/04DDEEFF/enabled": json({ rfid: "04DDEEFF", enabled: true }) });
    renderWithProviders(<Residents />);
    const dialog = await openCardsOfAnna();

    await userEvent.click(within(dialog).getByRole("switch", { name: "Card Old fob enabled" }));

    expect(await screen.findByText("Card Old fob enabled")).toBeInTheDocument();
    expect(lastBody(fetchMock, "PUT")).toEqual({ enabled: true });
    expect(within(dialog).queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("leaves the card as it was and says why when the change is refused", async () => {
    mockFetch({ ...routes(), "PUT /cards/04AABBCC/enabled": json({ detail: "Card not found" }, 404) });
    renderWithProviders(<Residents />);
    const dialog = await openCardsOfAnna();

    await userEvent.click(within(dialog).getByRole("switch", { name: "Card Tesla enabled" }));

    expect(await screen.findByText("Card not found")).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "Card Tesla enabled" })).toBeChecked();
  });
  it("sends the invitation again to someone who has not activated yet", async () => {    const fetchMock = mockFetch({ ...routes(), "POST /residents/2/send-invitation": json({ id: 2 }) });
    renderWithProviders(<Residents />);
    const bob = (await screen.findByText("Bob Brown")).closest("tr") as HTMLElement;

    await userEvent.click(within(bob).getByRole("button", { name: "Send the invitation again to Bob Brown" }));

    expect(await screen.findByText("Invitation sent to bob@example.com")).toBeInTheDocument();
    expect(requests(fetchMock)).toContainEqual(expect.stringMatching(/^POST .*\/residents\/2\/send-invitation$/));
  });

  it("offers no new invitation to an account that is active already", async () => {
    mockFetch(routes());
    renderWithProviders(<Residents />);

    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;

    expect(within(anna).queryByRole("button", { name: /send the invitation again/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /send the invitation again/i })).toHaveLength(1);
  });

  it("shows the reason when the invitation cannot be sent again", async () => {
    mockFetch({ ...routes(), "POST /residents/2/send-invitation": json({ detail: "Failed to send invitation email. Please try again." }, 500) });
    renderWithProviders(<Residents />);
    await screen.findByText("Bob Brown");

    await userEvent.click(screen.getByRole("button", { name: "Send the invitation again to Bob Brown" }));

    expect(await screen.findByText("Failed to send invitation email. Please try again.")).toBeInTheDocument();
  });

  it("tells the user when the residents cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderWithProviders(<Residents />);

    await waitFor(() => expect(screen.getByText("Failed to load residents.")).toBeInTheDocument());
  });

  describe("resident lifecycle per address", () => {
    it("lets a manager add a household member directly at an active address", async () => {
      let list = residents;
      const fetchMock = mockFetch({
        ...routes(),
        "GET /residents/": () => json(list),
        "POST /households/10/members": (_url, init) => {
          const created = {
            id: 99, status: "invited", roles: ["resident"], household_id: 10, is_main_member: false, household_head_id: 1,
            residency_start_date: "2026-01-01", residency_end_date: null, residency_state: "active" as const,
            ...address("Hoofdstraat", "12"), ...JSON.parse(String(init?.body)),
          };
          list = [...list, created];
          return json(created);
        },
      });
      renderWithProviders(<Residents />);
      await screen.findByText("Anna Anderson");

      await userEvent.click(screen.getByRole("button", { name: "Add household member at Hoofdstraat 12" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Full name"), "Partner Person");
      await userEvent.type(within(dialog).getByLabelText("Email"), "partner@example.com");
      await userEvent.click(within(dialog).getByRole("button", { name: /send invitation/i }));

      expect(await screen.findByText("Household member invited")).toBeInTheDocument();
      expect(await screen.findByText("Partner Person")).toBeInTheDocument();
      expect(lastBody(fetchMock, "POST")).toEqual({ full_name: "Partner Person", email: "partner@example.com" });
    });

    it("terminates residency for a household and then shows the Add new resident button at that address", async () => {
      let list = residents;
      const fetchMock = mockFetch({
        ...routes(),
        "GET /residents/": () => json(list),
        "PUT /households/10/termination": (_url, init) => {
          const { end_date } = JSON.parse(String(init?.body));
          list = list.map((r) => (r.household_id === 10 ? { ...r, residency_end_date: end_date } : r));
          return json(list.filter((r) => r.household_id === 10));
        },
      });
      renderWithProviders(<Residents />);
      await screen.findByText("Anna Anderson");

      expect(screen.queryByRole("button", { name: "Add new resident at Hoofdstraat 12" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Terminate residency at Hoofdstraat 12" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/Anna Anderson/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Terminate residency" }));

      expect(await screen.findByText(/Residency end date set to/)).toBeInTheDocument();
      expect(lastBody(fetchMock, "PUT")).toEqual({ end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(await screen.findByRole("button", { name: "Add new resident at Hoofdstraat 12" })).toBeInTheDocument();
    });

    it("pre-fills the address when clicking Add new resident on a terminated address", async () => {
      const endingResidents = [
        { ...residents[0], residency_end_date: "2026-12-31", residency_state: "active" as const },
      ];
      mockFetch(routes(endingResidents));
      renderWithProviders(<Residents />);
      await screen.findByText("Anna Anderson");

      await userEvent.click(screen.getByRole("button", { name: "Add new resident at Hoofdstraat 12" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Add new resident at Hoofdstraat 12")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Street name")).toHaveValue("Hoofdstraat");
      expect(within(dialog).getByLabelText("Street name")).toBeDisabled();
      expect(within(dialog).getByLabelText("House number")).toHaveValue("12");
      expect(within(dialog).getByLabelText("Residency start date")).toBeInTheDocument();
    });

    it("hides ended households by default behind a Show past residents toggle while keeping vacant addresses visible", async () => {
      const ended = [
        {
          ...residents[0],
          residency_start_date: "2025-01-01",
          residency_end_date: "2025-12-31",
          residency_state: "ended" as const,
        },
        residents[1],
      ];
      mockFetch(routes(ended));
      renderWithProviders(<Residents />);

      await screen.findByText("Bob Brown");
      expect(screen.getByText("Hoofdstraat 12")).toBeInTheDocument();
      expect(screen.getByText(/Vacant since/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add new resident at Hoofdstraat 12" })).toBeInTheDocument();
      expect(screen.queryByText("Anna Anderson")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("switch", { name: "Show past residents" }));
      expect(await screen.findByText("Anna Anderson")).toBeInTheDocument();
    });
  });
});
