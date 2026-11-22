import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeterValues, StationState } from "../hooks/useStationStatus";
import type { Tariff } from "../services/chargingCostService";
import { renderWithProviders } from "../test/render";
import StationStatusCard from "./StationStatusCard";

const meterValues = {
  timestamp: "2026-11-22T08:00:00Z",
  connectorId: 1,
  transactionId: 12,
  context: "Sample.Periodic",
  data: { "Power.Active.Import": 7.234, "Energy.Active.Import.Register": 12.5 },
} as MeterValues;

const renderCard = (state: StationState, { values = meterValues, rate = 0.3 as number | null, tariff = undefined as Tariff | undefined, loaded = true } = {}) =>
  renderWithProviders(
    <StationStatusCard state={state} meterValues={values} lastUpdate={new Date("2026-11-22T08:00:05Z")} loaded={loaded} rate={rate} tariff={tariff} />
  );

// Ant Design splits a value like 7.23 into separate elements for the whole and decimal part,
// so a metric is checked by the text of its whole tile.
const metric = (title: string) => screen.getByText(title).closest("div.ant-statistic") as HTMLElement;

describe("StationStatusCard", () => {
  it("says the charger is free and shows the rate", () => {
    renderCard("available");

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText(/Tap your card to start charging/)).toBeInTheDocument();
    expect(screen.getByText("€0.30")).toBeInTheDocument();
    expect(screen.queryByText("Power")).not.toBeInTheDocument();
  });

  it("shows power, energy and rate while the resident charges", () => {
    renderCard("mine");

    expect(screen.getByText("Charging")).toBeInTheDocument();
    expect(screen.getByText("You are charging now.")).toBeInTheDocument();
    expect(metric("Power")).toHaveTextContent("7.23kW");
    expect(metric("Energy")).toHaveTextContent("12.50kWh");
    expect(metric("Rate")).toHaveTextContent("€0.30/kWh");
  });

  it("names the tariff that applies next to the rate", () => {
    renderCard("available", { rate: 0.29, tariff: "dal" });

    expect(metric("Rate")).toHaveTextContent("€0.29/kWh · dal");
  });

  it("shows only the energy while somebody else charges, and no rate", () => {
    renderCard("other");

    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(metric("Energy")).toHaveTextContent("12.50kWh");
    expect(screen.queryByText("Power")).not.toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("says when there is no recent data", () => {
    renderCard("unknown");

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("There is no recent data from the charger.")).toBeInTheDocument();
  });

  it("leaves the rate out while it is not loaded yet", () => {
    renderCard("available", { rate: null });

    expect(screen.queryByText("Rate")).not.toBeInTheDocument();
  });
});
