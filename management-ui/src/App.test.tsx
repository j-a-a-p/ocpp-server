import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { json, mockFetch } from "./test/mockFetch";
import { ThemeProvider } from "./theme/ThemeProvider";

// Everything below the router is real: auth check, layout, navigation and the lazily loaded pages.
const stack = (validate: Response) =>
  mockFetch({
    "GET /auth/validate": validate,
    "GET /charge-transactions/all": json([]),
    "GET /meter_values.json": new Response("", { status: 404 }),
    "GET /residents/": json([]),
    "GET /charging-costs/": json([{ id: 1, kwh_price: 0.31, end_date: null, created: "2026-11-01T08:00:00" }]),
    "GET /charging-profiles/types/available": json({ profile_types: [] }),
    "GET /charging-profiles/": json([]),
    "GET /power-logs/": json([]),
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
    expect(labels).toEqual(["Dashboard", "Residents", "Charges", "Power logs", "Profiles", "Settings"]);
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
