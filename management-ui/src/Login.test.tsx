import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Login page (the link in the email)", () => {
  it("logs in with the token of the link", async () => {
    const fetchMock = mockFetch({ "POST /auth/login/abc123": json({ message: "You are logged in" }) });

    renderWithProviders(<Login />, { route: "/login?token=abc123" });

    expect(await screen.findByText("Login successful")).toBeInTheDocument();
    expect(screen.getByText("You are logged in")).toBeInTheDocument();
    expect(requests(fetchMock)).toEqual([expect.stringMatching(/^POST .*\/auth\/login\/abc123$/)]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("shows why the link was refused", async () => {
    mockFetch({ "POST /auth/login/old": json({ detail: "Login link has expired" }, 400) });

    renderWithProviders(<Login />, { route: "/login?token=old" });

    expect(await screen.findByText("Login failed")).toBeInTheDocument();
    expect(screen.getByText("Login link has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("says so when the link has no token, without calling the server", async () => {
    const fetchMock = mockFetch({});

    renderWithProviders(<Login />, { route: "/login" });

    expect(await screen.findByText("Invalid login link.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a retry when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderWithProviders(<Login />, { route: "/login?token=abc123" });

    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
  });
});
