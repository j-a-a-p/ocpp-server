import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/AuthContext";
import { json, mockFetch, requests } from "../test/mockFetch";
import { renderWithProviders } from "../test/render";
import ProtectedRoute from "./ProtectedRoute";

vi.mock("../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const checkAuth = vi.fn(async () => {});
const logout = vi.fn(async () => {});

const auth = (state: Partial<ReturnType<typeof useAuth>>) =>
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, isLoading: false, serverAvailable: true, noAccess: false, checkAuth, logout, ...state });

const renderRoute = () =>
  renderWithProviders(
    <ProtectedRoute>
      <p>Secret page</p>
    </ProtectedRoute>
  );

beforeEach(() => {
  checkAuth.mockClear();
});

describe("ProtectedRoute", () => {
  it("shows the page to a logged in resident", () => {
    auth({ isAuthenticated: true });

    renderRoute();

    expect(screen.getByText("Secret page")).toBeInTheDocument();
  });

  it("says there is no access to someone who is signed in without the manager role", async () => {
    auth({ noAccess: true });

    renderRoute();

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("shows nothing but a spinner while it checks the login", () => {
    auth({ isLoading: true });

    renderRoute();

    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
  });

  it("offers a retry when the server is unavailable", async () => {
    auth({ serverAvailable: false });

    renderRoute();
    await userEvent.click(screen.getByRole("button", { name: /retry connection/i }));

    expect(screen.getByText("Server unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    expect(checkAuth).toHaveBeenCalledOnce();
  });

  it("asks a visitor to sign in and opens the sign-in dialog", async () => {
    auth({});

    renderRoute();

    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    expect(await screen.findByText("Sign in to the management portal")).toBeInTheDocument();
  });

  const sendMail = async () => {
    const fetchMock = mockFetch({ "POST /auth/request-access": json({ success: true, message: "Check your mail" }) });
    renderRoute();
    await userEvent.type(await screen.findByPlaceholderText("you@example.com"), "anna@example.com");
    await userEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    return fetchMock;
  };

  it("sends the email address of the visitor", async () => {
    auth({});

    const fetchMock = await sendMail();

    await waitFor(() => expect(requests(fetchMock)).toEqual([expect.stringContaining("email=anna%40example.com&flow=management")]));
  });

  it("then says the mail is sent instead of asking to sign in again", async () => {
    auth({});

    await sendMail();

    expect(await screen.findByText("Login mail is sent")).toBeInTheDocument();
    expect(screen.getByText(/anna@example.com/)).toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
  });

  it("does not offer a button to close the page, a browser does not allow that", async () => {
    auth({});
    await sendMail();

    expect(await screen.findByText("Login mail is sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("lets the visitor use another email address", async () => {
    auth({});
    await sendMail();

    await userEvent.click(await screen.findByRole("button", { name: /different email address/i }));

    expect(await screen.findByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Login mail is sent")).not.toBeInTheDocument();
  });

  it("does not send an invalid email address", async () => {
    auth({});
    const fetchMock = mockFetch({});
    renderRoute();

    await userEvent.type(await screen.findByPlaceholderText("you@example.com"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
