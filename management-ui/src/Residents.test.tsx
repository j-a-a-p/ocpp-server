import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Residents from "./Residents";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const residents = [
  { id: 1, full_name: "Anna Anderson", email: "anna@example.com", status: "active" },
  { id: 2, full_name: "Bob Brown", email: "bob@example.com", status: "invited" },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Residents", () => {
  it("lists the residents with their email address and status", async () => {
    mockFetch({ "GET /residents/": json(residents) });

    renderWithProviders(<Residents />);

    const anna = (await screen.findByText("Anna Anderson")).closest("tr") as HTMLElement;
    expect(within(anna).getByText("anna@example.com")).toBeInTheDocument();
    expect(within(anna).getByText("Active")).toBeInTheDocument();
    expect(within(anna).getByText("AA")).toBeInTheDocument();
    const bob = screen.getByText("Bob Brown").closest("tr") as HTMLElement;
    expect(within(bob).getByText("Invited")).toBeInTheDocument();
    expect(screen.getByText("2 residents")).toBeInTheDocument();
  });

  it("understands a status in capitals too", async () => {
    mockFetch({ "GET /residents/": json([{ ...residents[0], status: "ACTIVE" }]) });

    renderWithProviders(<Residents />);

    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("invites a new resident", async () => {
    let list = residents;
    const fetchMock = mockFetch({
      "GET /residents/": () => json(list),
      "POST /residents/": (_url, init) => {
        const created = { id: 3, status: "invited", ...JSON.parse(String(init?.body)) };
        list = [...residents, created];
        return json(created);
      },
    });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Full name"), "Carol Clark");
    await userEvent.type(screen.getByLabelText("Email"), "carol@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Resident invited")).toBeInTheDocument();
    expect(await screen.findByText("Carol Clark")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ full_name: "Carol Clark", email: "carol@example.com" });
    expect(post[1]).toMatchObject({ credentials: "include" });
  });

  it("does not send an incomplete form", async () => {
    const fetchMock = mockFetch({ "GET /residents/": json(residents) });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Please enter full name")).toBeInTheDocument();
    expect(await screen.findByText("Please enter a valid email")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("shows the reason when the API refuses the resident", async () => {
    mockFetch({
      "GET /residents/": json(residents),
      "POST /residents/": json({ detail: "Resident with this email already exists" }, 400),
    });
    renderWithProviders(<Residents />);
    await screen.findByText("Anna Anderson");

    await userEvent.click(screen.getByRole("button", { name: /add resident/i }));
    await userEvent.type(screen.getByLabelText("Full name"), "Anna Again");
    await userEvent.type(screen.getByLabelText("Email"), "anna@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText("Resident with this email already exists")).toBeInTheDocument();
  });

  it("tells the user when the residents cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderWithProviders(<Residents />);

    await waitFor(() => expect(screen.getByText("Failed to load residents.")).toBeInTheDocument());
  });
});
