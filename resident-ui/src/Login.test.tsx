import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./contexts/AuthContext";
import Login from "./Login";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

vi.mock("./contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const checkAuth = vi.fn(async () => {});
const logout = vi.fn(async () => {});
const loggedOut = { isAuthenticated: false, isLoading: false, serverAvailable: true, checkAuth, logout };

const renderLogin = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<p>The app</p>} />
    </Routes>,
    { route }
  );

beforeEach(() => {
  checkAuth.mockClear();
  vi.mocked(useAuth).mockReturnValue(loggedOut);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Login page (the link in the email)", () => {
  it("logs in with the token of the link and goes straight to the app with a toast", async () => {
    const fetchMock = mockFetch({ "POST /auth/login/abc123": json({ message: "You are logged in" }) });

    renderLogin("/login?token=abc123");

    expect(await screen.findByText("The app")).toBeInTheDocument();
    expect(screen.getByText("Login successful")).toBeInTheDocument();
    expect(requests(fetchMock)).toEqual([expect.stringMatching(/^POST .*\/auth\/login\/abc123$/)]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("refreshes the login state before it opens the app, so the app does not ask for the email again", async () => {
    mockFetch({ "POST /auth/login/abc123": json({ message: "ok" }) });

    renderLogin("/login?token=abc123");
    await screen.findByText("The app");

    expect(checkAuth).toHaveBeenCalledOnce();
  });

  it("shows why the link was refused", async () => {
    mockFetch({ "POST /auth/login/old": json({ detail: "Login link has expired" }, 400) });

    renderLogin("/login?token=old");

    expect(await screen.findByText("Login failed")).toBeInTheDocument();
    expect(screen.getByText("Login link has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(checkAuth).not.toHaveBeenCalled();
  });

  it("says so when the link has no token, without calling the server", async () => {
    const fetchMock = mockFetch({});

    renderLogin("/login");

    expect(await screen.findByText("Invalid login link.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a retry when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    renderLogin("/login?token=abc123");

    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
  });

  it("does not use the token again for a resident who is logged in already", async () => {
    vi.mocked(useAuth).mockReturnValue({ ...loggedOut, isAuthenticated: true });
    const fetchMock = mockFetch({});

    renderLogin("/login?token=abc123");

    expect(await screen.findByText("The app")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits until the app knows whether the resident is logged in", async () => {
    vi.mocked(useAuth).mockReturnValue({ ...loggedOut, isLoading: true });
    const fetchMock = mockFetch({});

    renderLogin("/login?token=abc123");

    await waitFor(() => expect(screen.getByText("Logging in...")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
