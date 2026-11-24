import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Activate from "./Activate";
import { useAuth } from "./contexts/AuthContext";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

vi.mock("./contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const checkAuth = vi.fn(async () => {});
const logout = vi.fn(async () => {});

const renderActivate = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/activate" element={<Activate />} />
      <Route path="/" element={<p>The app</p>} />
    </Routes>,
    { route }
  );

beforeEach(() => {
  checkAuth.mockClear();
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, isLoading: false, serverAvailable: true, user: null, checkAuth, logout });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Activate page (the link in the welcome mail)", () => {
  it("activates the account, signs in and goes straight to the app with a toast", async () => {
    const fetchMock = mockFetch({ "POST /residents/activate/tok": json({ message: "Activated" }) });

    renderActivate("/activate?token=tok");

    expect(await screen.findByText("The app")).toBeInTheDocument();
    expect(screen.getByText("Account activated")).toBeInTheDocument();
    expect(requests(fetchMock)).toEqual([expect.stringMatching(/^POST .*\/residents\/activate\/tok$/)]);
    expect(checkAuth).toHaveBeenCalledOnce();
  });

  it("sends a manager who cannot charge to the management portal instead of the resident app", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    mockFetch({ "POST /residents/activate/tok": json({ message: "Activated", roles: ["manager"] }) });

    renderActivate("/activate?token=tok");

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/management-ui/"));
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("keeps someone who is a resident too in the resident app", async () => {
    mockFetch({ "POST /residents/activate/tok": json({ message: "Activated", roles: ["manager", "resident"] }) });

    renderActivate("/activate?token=tok");

    expect(await screen.findByText("The app")).toBeInTheDocument();
  });

  it("shows why the link was refused", async () => {
    mockFetch({ "POST /residents/activate/tok": json({ detail: "Token already used" }, 400) });

    renderActivate("/activate?token=tok");

    expect(await screen.findByText("Activation failed")).toBeInTheDocument();
    expect(screen.getByText("Token already used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("says so when the link has no token, without calling the server", async () => {
    const fetchMock = mockFetch({});

    renderActivate("/activate");

    expect(await screen.findByText("Invalid activation link.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
