import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PowerLogs from "./PowerLogs";
import { json, mockFetch } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

// The chart needs a canvas, which jsdom does not have. The page passes it the hourly data, so show that.
vi.mock("@ant-design/charts", () => ({
  Column: ({ data }: { data: { hour: string; year: string; energy: number }[] }) => (
    <div data-testid="hourly-chart">
      {data.filter((point) => point.energy > 0).map((point) => `${point.year} ${point.hour}=${point.energy}`).join(",")}
    </div>
  ),
}));

const summary = (total_kwh: number, extra = {}) => ({
  total_records: 3, total_hours: 1, total_kwh, max_power_kw: 9, avg_power_kw: 6.6667, ...extra,
});
const hours = (values: Record<number, number>) => Array.from({ length: 24 }, (_, hour) => values[hour] ?? 0);

const analytics = {
  current_year_summary: summary(7),
  monthly_data: [
    { year: 2026, month: 11, month_name: "November", ...summary(6) },
    { year: 2026, month: 10, month_name: "October", ...summary(1) },
  ],
  hourly_by_year: [
    { year: 2025, hourly_kwh: hours({ 22: 4.5 }) },
    { year: 2026, hourly_kwh: hours({ 10: 2, 11: 4, 22: 1 }) },
  ],
};

// The month cards repeat some titles; the summary tiles come first on the page.
const tile = async (title: string) => (await screen.findAllByText(title, { selector: ".ant-statistic-title" }))[0].closest("div.ant-statistic") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 22, 12, 0));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.useRealTimers());

describe("PowerLogs", () => {
  it("shows the summary of the current year and each of the last twelve months", async () => {
    mockFetch({ "GET /power-logs/analytics": json(analytics) });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("Current year (2026)")).toBeInTheDocument();
    expect(await tile("Total energy")).toHaveTextContent("7.00 kWh");
    expect(await tile("Max power")).toHaveTextContent("9.00 kW");
    expect(await tile("Average power")).toHaveTextContent("6.67 kW");
    expect(await tile("Hours charged")).toHaveTextContent("1.0 h");
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("passes the kWh per hour of the day of every year to the chart", async () => {
    mockFetch({ "GET /power-logs/analytics": json(analytics) });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("Hourly energy distribution (last 3 years)")).toBeInTheDocument();
    expect(await screen.findByTestId("hourly-chart")).toHaveTextContent(
      "2025 22:00=4.5,2026 10:00=2,2026 11:00=4,2026 22:00=1"
    );
  });

  it("explains that there is no data yet", async () => {
    mockFetch({
      "GET /power-logs/analytics": json({ current_year_summary: summary(0, { total_records: 0 }), monthly_data: [], hourly_by_year: [] }),
    });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("No power log data yet")).toBeInTheDocument();
  });

  it("tells the user when the logs cannot be loaded", async () => {
    mockFetch({ "GET /power-logs/analytics": json({}, 500) });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("Failed to load PowerLog data.")).toBeInTheDocument();
    expect(screen.getByText("No power log data yet")).toBeInTheDocument();
  });
});
