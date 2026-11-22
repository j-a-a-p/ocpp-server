import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Charges from "./Charges";
import { json, mockFetch } from "./test/mockFetch";
import { renderWithProviders } from "./test/render";
import { downloadYearlyReportPdf } from "./utils/yearlyReportPdf";

// The PDF itself is tested in utils/yearlyReportPdf.test.ts; here only what the page hands to it.
vi.mock("./utils/yearlyReportPdf", () => ({ downloadYearlyReportPdf: vi.fn() }));

const charge = (id: number, resident_name: string, created: string, final_energy_kwh: number, costs: number[] = []) => ({
  id, station_id: "CP1", rfid: "04AABBCC", created, final_energy_kwh, resident_name,
  total_cost: costs.reduce((sum, cost) => sum + cost, 0),
});

// Mid-month dates, so the month is the same in every timezone.
const charges = [
  charge(1, "Anna Anderson", "2026-11-05T12:00:00", 10, [3]),
  charge(2, "Anna Anderson", "2026-11-20T12:00:00", 5.5, [1, 0.65]),
  charge(3, "Bob Brown", "2026-11-12T12:00:00", 8, [2.4]),
  charge(4, "Anna Anderson", "2026-10-15T12:00:00", 4, [1.2]),
  charge(5, "Anna Anderson", "2025-12-15T12:00:00", 6, [1.8]),
  charge(6, "Bob Brown", "2026-11-14T12:00:00", 0, []), // failed start: no energy
];

const rowsOf = (title: string) => {
  const card = screen.getByText(title).closest(".ant-card") as HTMLElement;
  return within(card).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(downloadYearlyReportPdf).mockReset().mockResolvedValue(undefined);
});

describe("Charges", () => {
  it("summarizes per year and resident, newest year first", async () => {
    mockFetch({ "GET /charge-transactions/all": json(charges) });

    renderWithProviders(<Charges />);

    await screen.findAllByText("2026");
    expect(rowsOf("Yearly summaries")).toEqual([
      ["2026", "Anna Anderson", "19.50", "3", "€5.85", "PDF"],
      ["2026", "Bob Brown", "8.00", "1", "€2.40", "PDF"],
      ["2025", "Anna Anderson", "6.00", "1", "€1.80", "PDF"],
    ]);
  });

  it("shows thousands separators in the energy, the cost and the counts, but not in the year", async () => {
    mockFetch({ "GET /charge-transactions/all": json([charge(1, "Bob Brown", "2026-11-12T12:00:00", 12345.678, [1234.5, 1000])]) });

    renderWithProviders(<Charges />);

    await screen.findAllByText("2026");
    expect(rowsOf("Yearly summaries")).toEqual([["2026", "Bob Brown", "12,345.68", "1", "€2,234.50", "PDF"]]);
    expect(rowsOf("Monthly charge data")).toEqual([["November '26", "Bob Brown", "12,345.68", "1", "€2,234.50"]]);
  });

  it("makes the PDF report of the resident and year of the row, with the same totals as the row", async () => {
    mockFetch({ "GET /charge-transactions/all": json(charges) });
    renderWithProviders(<Charges />);
    await screen.findAllByText("2026");

    await userEvent.click(screen.getByRole("button", { name: "Export the 2026 report of Anna Anderson as PDF" }));

    expect(downloadYearlyReportPdf).toHaveBeenCalledTimes(1);
    const report = vi.mocked(downloadYearlyReportPdf).mock.calls[0][0];
    expect(report).toMatchObject({ resident_name: "Anna Anderson", year: 2026 });
    expect(report.total_cost).toBeCloseTo(5.85);
    expect(report.total_energy).toBeCloseTo(19.5);
    expect(report.sessions).toHaveLength(3);
  });

  it("makes a report for every resident and year in the table", async () => {
    mockFetch({ "GET /charge-transactions/all": json(charges) });
    renderWithProviders(<Charges />);
    await screen.findAllByText("2026");

    expect(screen.getAllByRole("button", { name: /^Export the \d{4} report of .* as PDF$/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Export the 2025 report of Anna Anderson as PDF" }));

    expect(vi.mocked(downloadYearlyReportPdf).mock.calls[0][0]).toMatchObject({ resident_name: "Anna Anderson", year: 2025 });
  });

  it("tells the user when the PDF cannot be made", async () => {
    vi.mocked(downloadYearlyReportPdf).mockRejectedValue(new Error("boom"));
    mockFetch({ "GET /charge-transactions/all": json(charges) });
    renderWithProviders(<Charges />);
    await screen.findAllByText("2026");

    await userEvent.click(screen.getByRole("button", { name: "Export the 2026 report of Bob Brown as PDF" }));

    expect(await screen.findByText("Failed to create the PDF report.")).toBeInTheDocument();
  });

  it("lists the months per resident, newest month first", async () => {
    mockFetch({ "GET /charge-transactions/all": json(charges) });

    renderWithProviders(<Charges />);

    await screen.findAllByText("November '26");
    expect(rowsOf("Monthly charge data")).toEqual([
      ["November '26", "Anna Anderson", "15.50", "2", "€4.65"],
      ["November '26", "Bob Brown", "8.00", "1", "€2.40"],
      ["October '26", "Anna Anderson", "4.00", "1", "€1.20"],
      ["December '25", "Anna Anderson", "6.00", "1", "€1.80"],
    ]);
  });

  it("keeps the whole name of a resident whose name has a hyphen", async () => {
    mockFetch({ "GET /charge-transactions/all": json([charge(1, "Anne-Marie de Vries-Jansen", "2026-11-05T12:00:00", 10, [3])]) });

    renderWithProviders(<Charges />);

    await screen.findByText("2026");
    expect(rowsOf("Yearly summaries")[0][1]).toBe("Anne-Marie de Vries-Jansen");
    expect(rowsOf("Monthly charge data")[0][1]).toBe("Anne-Marie de Vries-Jansen");
  });

  it("explains when there are no charges", async () => {
    mockFetch({ "GET /charge-transactions/all": json([]) });

    renderWithProviders(<Charges />);

    expect(await screen.findAllByText("No charge transactions yet")).toHaveLength(2);
  });

  it("explains when every charge failed to deliver energy", async () => {
    mockFetch({ "GET /charge-transactions/all": json([charge(1, "Bob Brown", "2026-11-14T12:00:00", 0)]) });

    renderWithProviders(<Charges />);

    expect(await screen.findAllByText("No charge transactions yet")).toHaveLength(2);
  });

  it("tells the user when the charges cannot be loaded", async () => {
    mockFetch({ "GET /charge-transactions/all": json({}, 500) });

    renderWithProviders(<Charges />);

    expect(await screen.findByText("Failed to load charge transactions.")).toBeInTheDocument();
  });
});
