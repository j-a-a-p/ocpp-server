import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { json, mockFetch, requests } from "./test/mockFetch";
import { ThemeProvider } from "./theme/ThemeProvider";

// Everything below the router is real: auth check, layout, navigation and the lazily loaded pages.
const stack = (validate: Response) =>
  mockFetch({
    "GET /auth/validate": validate,
    "GET /charge-transactions/all": json([]),
    "GET /meter_values.json": new Response("", { status: 404 }),
    "GET /residents/": json([]),
    "GET /charging-costs/": json([{ id: 1, kwh_price: 0.31, kwh_price_dal: 0.3, end_date: null, created: "2026-11-01T08:00:00" }]),
    "GET /charging-profiles/types/available": json({ profile_types: [] }),
    "GET /charging-profiles/": json([]),
    "GET /power-logs/analytics": json({ current_year_summary: {}, monthly_data: [], hourly_by_year: [] }),
    "GET /stations/": json({ generated_at: "2026-11-22T12:00:00Z", window_start: "2026-11-21T12:00:00Z", window_hours: 24, online_count: 0, stations: [] }),
  });

const open = (path: string) => {
  window.history.pushState({}, "", `/management-ui${path}`);
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
};

const sidebar = () => document.querySelector(".app-sider") as HTMLElement;
const pageTitle = () => document.querySelector(".app-header h4")?.textContent;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("management App", () => {
  it("asks an unknown visitor to sign in instead of showing the pages", async () => {
    stack(new Response("", { status: 401 }));

    open("/residents");

    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.queryByText("Charger")).not.toBeInTheDocument();
  });

  it("asks for the manager role of the signed in account and says there is no access without it", async () => {
    const fetchMock = stack(json({ detail: "This requires the manager role" }, 403));

    open("/residents");

    expect(await screen.findByText("No access")).toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
    expect(requests(fetchMock)).toEqual(expect.arrayContaining([expect.stringMatching(/\/auth\/validate\?flow=management$/)]));
  });

  it("says so when the server is unavailable", async () => {
    stack(new Response("", { status: 503 }));

    open("/");

    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
  });

  it("shows the dashboard to a signed-in resident and lists every page in the menu", async () => {
    stack(json({}));

    open("/");

    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));
    const labels = within(sidebar()).getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels).toEqual(["Dashboard", "Residents", "Charges", "Power logs", "Stations", "Profiles", "Settings"]);
  });

  it("opens the page of a menu item and loads its data", async () => {
    stack(json({}));
    open("/");
    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));

    await userEvent.click(within(sidebar()).getByRole("menuitem", { name: /settings/i }));

    expect(await screen.findByText("€0.3100")).toBeInTheDocument();
    expect(pageTitle()).toBe("Settings");
    expect(window.location.pathname).toBe("/management-ui/settings");
  });

  it("opens the stations page from the menu", async () => {
    stack(json({}));
    open("/");
    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));

    await userEvent.click(within(sidebar()).getByRole("menuitem", { name: /stations/i }));

    expect(await screen.findByText("No charging station has connected yet")).toBeInTheDocument();
    expect(pageTitle()).toBe("Charging stations");
    expect(window.location.pathname).toBe("/management-ui/stations");
  });

  it("signs in through the link in the mail and lands on the dashboard without asking again", async () => {
    let signedIn = false;
    const fetchMock = stack(json({}));
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/validate")) return new Response("", { status: signedIn ? 200 : 401 });
      if (url.includes("/auth/login/abc")) {
        signedIn = true;
        return json({ message: "ok" });
      }
      return answer(input, init);
    });

    open("/login?token=abc");

    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));
    expect(screen.getByText("Login successful")).toBeInTheDocument();
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/management-ui");
  });

  it("logs out with the button in the header and asks to sign in again", async () => {
    let signedIn = true;
    const fetchMock = stack(json({}));
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/validate")) return new Response("", { status: signedIn ? 200 : 401 });
      if (url.includes("/auth/logout")) {
        signedIn = false;
        return json({ message: "Logged out" });
      }
      return answer(input, init);
    });
    open("/");
    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(requests(fetchMock)).toEqual(expect.arrayContaining([expect.stringMatching(/^POST .*\/auth\/logout$/)]));
    expect(document.querySelector(".app-sider")).toBeNull();
  });

  it("stays signed in and says so when logging out fails", async () => {
    const fetchMock = stack(json({}));
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input).includes("/auth/logout") ? new Response("", { status: 500 }) : answer(input, init)
    );
    open("/");
    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByText("Failed to log out")).toBeInTheDocument();
    expect(pageTitle()).toBe("Dashboard");
  });

  it("opens a page directly from its address", async () => {
    stack(json({}));

    open("/charges");

    await waitFor(() => expect(pageTitle()).toBe("Charge reports"));
  });

  it("sends an unknown address to the dashboard", async () => {
    stack(json({}));

    open("/does-not-exist");

    await waitFor(() => expect(pageTitle()).toBe("Dashboard"));
    expect(window.location.pathname).toBe("/management-ui");
  });
});
