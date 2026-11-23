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
    roles: ["manager", "resident"], household_head_id: null, ...address("Hoofdstraat", "12"),
  },
  {
    id: 2, full_name: "Bob Brown", email: "bob@example.com", status: "invited",
    roles: ["resident"], household_head_id: null, ...address("Kerkstraat", "3", "A"),
  },
];

const addressOptions = [
  { street_name: "Hoofdstraat", house_number: "12", house_number_suffix: null, zip_code: "3511 AB", city: "Utrecht" },
  { street_name: "Hoofdstraat", house_number: "12", house_number_suffix: "A", zip_code: "3511 AB", city: "Utrecht" },
  { street_name: "Kerkstraat", house_number: "3", house_number_suffix: null, zip_code: "3512 CD", city: "Utrecht" },
];

const routes = (list: unknown = residents) => ({
  "GET /residents/address-options": json(addressOptions),
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
    expect(within(anna).getByText("Resident")).toBeInTheDocument();
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
        { ...residents[1], id: 5, full_name: "Carol Clark", ...address("Kerkstraat", "10") },
        { ...residents[1], id: 4, full_name: "Dave Dunn", roles: ["manager"], ...address(null) },
        { ...residents[1], id: 3, full_name: "Eve Evans", household_head_id: 1, ...address("Hoofdstraat", "12") },
        residents[0],
        { ...residents[1], id: 6, full_name: "Bob Brown", ...address("Kerkstraat", "3", "A") },
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
        const created = { id: 3, status: "invited", household_head_id: null, ...JSON.parse(String(init?.body)) };
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
    });
  });

  it("tells the user when the residents cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderWithProviders(<Residents />);

    await waitFor(() => expect(screen.getByText("Failed to load residents.")).toBeInTheDocument());
  });
});
