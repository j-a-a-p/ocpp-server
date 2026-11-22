import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stations from "./Stations";
import type { StationOverview } from "./services/stationService";
import { json, mockFetch, requests } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

// The window is the 24 hours before 22 Nov 12:00 UTC, so 6 hours into it is 25% of the timeline.
const overview: StationOverview = {
  generated_at: "2026-11-22T12:00:00Z",
  window_start: "2026-11-21T12:00:00Z",
  window_hours: 24,
  online_count: 2,
  stations: [
    {
      station_id: "CP1", online: true, connected_since: "2026-11-22T09:00:00Z", last_seen: "2026-11-22T11:59:50Z",
      first_seen: "2026-11-01T08:00:00Z", uptime_percent: 90, connections: 3,
      online_periods: [
        { start: "2026-11-21T18:00:00Z", end: "2026-11-22T06:00:00Z" },
        { start: "2026-11-22T09:00:00Z", end: "2026-11-22T12:00:00Z" },
      ],
    },
    {
      station_id: "CP2", online: false, connected_since: null, last_seen: "2026-11-22T11:30:00Z",
      first_seen: "2026-11-21T12:00:00Z", uptime_percent: 50, connections: 1,
      online_periods: [{ start: "2026-11-21T12:00:00Z", end: "2026-11-22T00:00:00Z" }],
    },
    {
      station_id: "CP3", online: true, connected_since: "2026-11-22T11:59:30Z", last_seen: "2026-11-22T11:59:55Z",
      first_seen: "2026-11-22T11:59:30Z", uptime_percent: null, connections: 1,
      online_periods: [{ start: "2026-11-22T11:59:30Z", end: "2026-11-22T12:00:00Z" }],
    },
  ],
};

const empty: StationOverview = { ...overview, online_count: 0, stations: [] };

// The summary tiles are Ant Design statistics, their titles are also used elsewhere on the page.
const tile = async (title: string) => (await screen.findByText(title, { selector: ".ant-statistic-title" })).closest("div.ant-statistic") as HTMLElement;
const row = async (station: string) => within(await screen.findByRole("row", { name: new RegExp(station) }));
const lastRequest = (fetchMock: ReturnType<typeof mockFetch>) => {
  const all = requests(fetchMock);
  return all[all.length - 1];
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.useRealTimers());

describe("Stations", () => {
  it("counts the stations that are online and offline", async () => {
    mockFetch({ "GET /stations/": json(overview) });

    renderWithProviders(<Stations />);

    expect(await tile("Online now")).toHaveTextContent(/2\s*of 3/);
    expect(await tile("Offline")).toHaveTextContent("1");
    // CP3 has no uptime yet and is left out of the average: (90 + 50) / 2.
    expect(await tile("Average uptime (24 hours)")).toHaveTextContent("70.0%");
  });

  it("lists every station with its status, how long it has been online and its uptime", async () => {
    mockFetch({ "GET /stations/": json(overview) });

    renderWithProviders(<Stations />);

    const cp1 = await row("CP1");
    expect(cp1.getByText("Online")).toBeInTheDocument();
    expect(cp1.getByText("Online for 3 h")).toBeInTheDocument();
    expect(cp1.getByText("90.0%")).toBeInTheDocument();
    expect(cp1.getByText("3")).toBeInTheDocument();

    const cp2 = await row("CP2");
    expect(cp2.getByText("Offline")).toBeInTheDocument();
    expect(cp2.getByText(/^Last seen 30 min ago/)).toBeInTheDocument();
    expect(cp2.getByText("50.0%")).toBeInTheDocument();

    const cp3 = await row("CP3");
    expect(cp3.getByText("Online for less than a minute")).toBeInTheDocument();
    expect(cp3.getByText("-")).toBeInTheDocument();
  });

  it("draws the online periods on a timeline of the window", async () => {
    mockFetch({ "GET /stations/": json(overview) });

    renderWithProviders(<Stations />);

    await screen.findByText("Online timeline");
    const periods = screen.getAllByTitle(/^Online /);
    expect(periods).toHaveLength(4);
    // CP1: 18:00 to 06:00 is the second half of the first day, 09:00 to now the last eighth.
    expect(periods[0]).toHaveStyle({ left: "25%", width: "50%" });
    expect(periods[1]).toHaveStyle({ left: "87.5%", width: "12.5%" });
    // CP2: from the start of the window to midnight.
    expect(periods[2]).toHaveStyle({ left: "0%", width: "50%" });
    expect(screen.getByRole("img", { name: "CP1: online 90.0% of the time" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "CP3: no uptime yet" })).toBeInTheDocument();
  });

  it("shows another window when the range is changed", async () => {
    const fetchMock = mockFetch({
      "GET /stations/": (url) => json({ ...overview, window_hours: url.includes("hours=168") ? 168 : 24 }),
    });
    renderWithProviders(<Stations />);
    await screen.findByText("Online timeline");
    expect(lastRequest(fetchMock)).toMatch(/\/stations\/\?hours=24$/);

    await userEvent.click(screen.getByText("7 days"));

    await waitFor(() => expect(lastRequest(fetchMock)).toMatch(/\/stations\/\?hours=168$/));
    expect(await tile("Average uptime (7 days)")).toHaveTextContent("70.0%");
  });

  it("explains that no station has connected yet", async () => {
    mockFetch({ "GET /stations/": json(empty) });

    renderWithProviders(<Stations />);

    expect(await screen.findByText("No charging station has connected yet")).toBeInTheDocument();
    expect(await tile("Online now")).toHaveTextContent(/0\s*of 0/);
    expect(await tile("Average uptime (24 hours)")).toHaveTextContent("-");
    expect(screen.queryByText("Online timeline")).not.toBeInTheDocument();
  });

  it("tells the user when the stations cannot be loaded", async () => {
    mockFetch({ "GET /stations/": json({}, 500) });

    renderWithProviders(<Stations />);

    expect(await screen.findByText("The stations could not be loaded. Trying again...")).toBeInTheDocument();
    expect(screen.getByText("No station data")).toBeInTheDocument();
  });

  it("refreshes by itself, and keeps what it showed when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let calls = 0;
    mockFetch({ "GET /stations/": () => (++calls === 1 ? json(overview) : json({}, 500)) });
    renderWithProviders(<Stations />);
    await row("CP1");
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(calls).toBe(2);
    expect(await screen.findByText("The stations could not be loaded. Trying again...")).toBeInTheDocument();
    expect((await row("CP1")).getByText("Online for 3 h")).toBeInTheDocument();
  });
});
