import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PowerLogs from "./PowerLogs";
import { json, mockFetch } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";

// The chart needs a canvas, which jsdom does not have. The page passes it the hourly data, so show that.
vi.mock("@ant-design/charts", () => ({
  Column: ({ data }: { data: { hour: string; energy: number }[] }) => (
    <div data-testid="hourly-chart">{data.filter((point) => point.energy > 0).map((point) => `${point.hour}=${point.energy}`).join(",")}</div>
  ),
}));

const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();
const log = (id: number, transaction: number, created: string, power_kw: number, energy_kwh: number) => ({
  id, charge_transaction_id: transaction, created, power_kw, energy_kwh,
});

// The month cards repeat some titles; the summary tiles come first on the page.
const tile = async (title: string) => (await screen.findAllByText(title, { selector: ".ant-statistic-title" }))[0].closest("div.ant-statistic") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 22, 12, 0));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.useRealTimers());

describe("PowerLogs", () => {
  it("summarizes the current year and each of the last twelve months", async () => {
    mockFetch({
      "GET /power-logs/": json([
        log(1, 1, at(11, 20, 10, 0), 7, 2),
        log(2, 1, at(11, 20, 11, 0), 9, 6),
        log(3, 2, at(10, 5, 9, 0), 4, 1),
      ]),
    });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("Current year (2026)")).toBeInTheDocument();
    expect(await tile("Total energy")).toHaveTextContent("7.00 kWh");
    expect(await tile("Max power")).toHaveTextContent("9.00 kW");
    expect(await tile("Average power")).toHaveTextContent("6.67 kW");
    expect(await tile("Hours charged")).toHaveTextContent("1.0 h");
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("passes the power per hour of the day to the chart", async () => {
    mockFetch({
      "GET /power-logs/": json([log(1, 1, at(11, 20, 10, 0), 7, 2), log(2, 1, at(11, 20, 10, 30), 3, 3), log(3, 1, at(11, 20, 14, 0), 5, 4)]),
    });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByTestId("hourly-chart")).toHaveTextContent("10:00=10,14:00=5");
  });

  it("explains that there is no data yet", async () => {
    mockFetch({ "GET /power-logs/": json([]) });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("No power log data yet")).toBeInTheDocument();
  });

  it("tells the user when the logs cannot be loaded", async () => {
    mockFetch({ "GET /power-logs/": json({}, 500) });

    renderWithProviders(<PowerLogs />);

    expect(await screen.findByText("Failed to load PowerLog data.")).toBeInTheDocument();
    expect(screen.getByText("No power log data yet")).toBeInTheDocument();
  });
});
