import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profiles from "./Profiles";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

const profile = (id: number, name: string, status: string, max_current = 16) => ({
  id, name, status, max_current, profile_type: "max_current", created_at: "2026-11-10T08:00:00", updated_at: "2026-11-10T08:00:00",
});

const types = {
  profile_types: [{ value: "max_current", label: "Max Current", description: "Limit the maximum current", fields: ["max_current"] }],
};

const stack = (profiles: ReturnType<typeof profile>[], extra: Parameters<typeof mockFetch>[0] = {}) =>
  mockFetch({
    "GET /charging-profiles/types/available": json(types),
    "GET /charging-profiles/": json(profiles),
    ...extra,
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Profiles", () => {
  const profiles = [profile(1, "Night limit", "Active", 10), profile(2, "Draft limit", "Draft", 16), profile(3, "Old limit", "Inactive", 20)];

  it("lists the profiles that are not inactive, with their type and current", async () => {
    stack(profiles);

    renderWithProviders(<Profiles />);

    const night = (await screen.findByText("Night limit")).closest("tr") as HTMLElement;
    expect(within(night).getByText("Max Current")).toBeInTheDocument();
    expect(within(night).getByText("Active")).toBeInTheDocument();
    expect(within(night).getByText("10 A")).toBeInTheDocument();
    expect(screen.getByText("Draft limit")).toBeInTheDocument();
    expect(screen.queryByText("Old limit")).not.toBeInTheDocument();
  });

  it("shows inactive profiles on request, with a way to bring them back", async () => {
    const fetchMock = stack(profiles, { "PUT /charging-profiles/3/reactivate": json({ message: "ok", profile: profile(3, "Old limit", "Draft") }) });
    renderWithProviders(<Profiles />);
    await screen.findByText("Night limit");

    await userEvent.click(screen.getByRole("switch"));
    const old = (await screen.findByText("Old limit")).closest("tr") as HTMLElement;
    await userEvent.click(within(old).getByRole("button", { name: /reactivate/i }));

    expect(await screen.findByText("Profile reactivated successfully!")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("PUT"))).toEqual([expect.stringMatching(/\/charging-profiles\/3\/reactivate$/)]);
  });

  it("asks for confirmation before it inactivates a profile", async () => {
    const fetchMock = stack(profiles, { "PUT /charging-profiles/1/inactivate": json({ message: "ok", profile: profile(1, "Night limit", "Inactive") }) });
    renderWithProviders(<Profiles />);
    const night = (await screen.findByText("Night limit")).closest("tr") as HTMLElement;

    await userEvent.click(within(night).getByRole("button", { name: /inactivate/i }));
    expect(requests(fetchMock).filter((request) => request.startsWith("PUT"))).toEqual([]);
    const confirm = await screen.findByText("Are you sure you want to inactivate this profile?");
    await userEvent.click(within(confirm.closest(".ant-popover") as HTMLElement).getByRole("button", { name: "Yes" }));

    expect(await screen.findByText("Profile inactivated successfully!")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("PUT"))).toEqual([expect.stringMatching(/\/charging-profiles\/1\/inactivate$/)]);
  });

  it("creates a profile: the current field appears once a type is chosen", async () => {
    const fetchMock = stack([], {
      "POST /charging-profiles/": json(profile(4, "Weekend", "Draft", 25)),
    });
    renderWithProviders(<Profiles />);
    await waitFor(() => expect(requests(fetchMock).some((request) => request.includes("types/available"))).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.queryByLabelText("Max Current (A)")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Profile Name"), "Weekend");
    fireEvent.mouseDown(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Max Current"));
    await userEvent.type(await screen.findByLabelText("Max Current (A)"), "25");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(await screen.findByText("Profile created successfully!")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ name: "Weekend", profile_type: "max_current", max_current: 25 });
  });

  it("does not create a profile without a name", async () => {
    const fetchMock = stack([]);
    renderWithProviders(<Profiles />);

    await userEvent.click(await screen.findByRole("button", { name: /add profile/i }));
    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(await screen.findByText("Please enter profile name")).toBeInTheDocument();
    expect(requests(fetchMock).filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("tells the user when the profiles cannot be loaded", async () => {
    mockFetch({ "GET /charging-profiles/types/available": json(types), "GET /charging-profiles/": json({}, 500) });

    renderWithProviders(<Profiles />);

    expect(await screen.findByText("Failed to load profiles")).toBeInTheDocument();
  });
});
