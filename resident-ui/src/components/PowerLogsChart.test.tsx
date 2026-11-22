import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PowerLog } from "../services/chargeTransactionService";
import { renderWithProviders } from "../test/render";
import PowerLogsChart from "./PowerLogsChart";

// The chart needs a canvas, which jsdom does not have. Show the values the page passes to it instead.
vi.mock("@ant-design/charts", () => ({
  Line: ({ data }: { data: { energy: number; cost: number }[] }) => (
    <div data-testid="line">{data.map((point) => `${point.energy.toFixed(2)}/${point.cost.toFixed(2)}`).join(" ")}</div>
  ),
}));

let nextId = 1;
const log = (minute: number, power_kw: number, energy_kwh: number, delta_power_cost: number): PowerLog => ({
  id: nextId++,
  charge_transaction_id: 1,
  created: `2026-11-22T08:${String(minute).padStart(2, "0")}:00`,
  power_kw,
  energy_kwh,
  delta_power_cost,
  kwh_rate: 0.3,
});

const statistic = (title: string) => screen.getByText(title).closest("div.ant-statistic") as HTMLElement;

describe("PowerLogsChart", () => {
  // The last reading of a real session was another counter: 12.01 kWh dropped to 2.24 with no power.
  const session = [log(0, 20, 11.35, 0.1), log(1, 20.8, 11.68, 0.1), log(2, 20.8, 12.01, 0.1), log(6, 0, 2.24, 0)];

  it("never lets the energy go down, and shows the cost so far instead of the cost of one step", () => {
    renderWithProviders(<PowerLogsChart powerLogs={session} transactionId={1} />);

    expect(screen.getByTestId("line")).toHaveTextContent("11.35/0.10 11.68/0.20 12.01/0.30 12.01/0.30");
  });

  it("summarizes the whole session", () => {
    renderWithProviders(<PowerLogsChart powerLogs={session} transactionId={1} />);

    expect(statistic("Energy")).toHaveTextContent("12.01kWh");
    expect(statistic("Max power")).toHaveTextContent("20.80kW");
    expect(statistic("Duration")).toHaveTextContent("6min");
    expect(statistic("Cost")).toHaveTextContent("€0.30");
  });
});
