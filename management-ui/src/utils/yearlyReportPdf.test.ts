import { describe, expect, it } from "vitest";
import { createYearlyReportPdf, reportFileName, toPdfText } from "./yearlyReportPdf";
import type { ReportSession, YearlyReport } from "./yearlyReport";

const session = (index: number, overrides: Partial<ReportSession> = {}): ReportSession => ({
  id: index,
  started: new Date(2026, 10, 1 + (index % 28), 9, 0),
  ended: new Date(2026, 10, 1 + (index % 28), 10, 25),
  station: "ChargeBox-001",
  resident: "Anna Anderson",
  card: "Tesla",
  energy: 10,
  cost: 3,
  ...overrides,
});

const report = (sessions: ReportSession[], overrides: Partial<YearlyReport> = {}): YearlyReport => ({
  address: "Hoofdstraat 12",
  address_key: "hoofdstraat|12|",
  residents: ["Anna Anderson"],
  year: 2026,
  generated: new Date(2026, 11, 31, 10, 0),
  total_energy: sessions.reduce((sum, item) => sum + item.energy, 0),
  total_cost: sessions.reduce((sum, item) => sum + item.cost, 0),
  sessions,
  months: [{ month: 11, name: "November", sessions: sessions.length, energy: sessions.length * 10, cost: sessions.length * 3 }],
  ...overrides,
});

describe("createYearlyReportPdf", () => {
  it("makes a PDF with the address, the amount to pay and when they charged", async () => {
    const doc = await createYearlyReportPdf(
      report([session(1), session(2, { card: "Zoe", cost: 1234.5, energy: 1500 })], { total_cost: 1237.5, total_energy: 1510 })
    );
    const pdf = doc.output();

    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("Hoofdstraat 12");
    expect(pdf).toContain("Resident: Anna Anderson");
    expect(pdf).toContain("AMOUNT TO PAY");
    // The amount and the energy have thousands separators; the euro sign is one byte of the PDF's Windows encoding.
    expect(pdf).toContain("\u00801,237.50");
    expect(pdf).toContain("1,510.00 kWh");
    expect(pdf).toContain("When you charged");
    expect(pdf).toContain("ChargeBox-001");
    expect(pdf).toContain("09:00 - 10:25");
    expect(pdf).toContain("1 h 25 min");
    expect(doc.getNumberOfPages()).toBe(1);
    expect(pdf).toContain("Page 1 of 1");
  });

  it("continues on more pages when there are many charges, with a footer on every page", async () => {
    const doc = await createYearlyReportPdf(report(Array.from({ length: 60 }, (_, index) => session(index))));
    const pages = doc.getNumberOfPages();
    const pdf = doc.output();

    expect(pages).toBeGreaterThan(1);
    for (let page = 1; page <= pages; page += 1) expect(pdf).toContain(`Page ${page} of ${pages}`);
  });

  it("lists everybody at the address, with a column for who charged when there are more of them", async () => {
    const together = report([session(1), session(2, { resident: "Bob Brown" })], { residents: ["Anna Anderson", "Bob Brown"] });

    const pdf = (await createYearlyReportPdf(together)).output();

    expect(pdf).toContain("Residents: Anna Anderson, Bob Brown");
    expect(pdf).toContain("(Resident)");
    expect(pdf).toContain("(Bob Brown)");
  });

  it("has no column for who charged when one person lives at the address", async () => {
    const pdf = (await createYearlyReportPdf(report([session(1)]))).output();

    expect(pdf).not.toContain("(Resident)");
  });

  it("copes with a charge that has no end", async () => {
    const doc = await createYearlyReportPdf(report([session(1, { ended: null })]));

    expect(doc.output()).toContain("09:00");
  });

  it("names the document after the address and the year", async () => {
    const doc = await createYearlyReportPdf(report([session(1)]));

    expect(doc.output()).toContain("/Title (Charging report 2026 - Hoofdstraat 12)");
  });

  it("includes the main member and clipped residency period when provided", async () => {
    const pdf = (
      await createYearlyReportPdf(
        report([session(1)], {
          main_resident: "Anna Anderson",
          main_resident_email: "anna@example.com",
          period_start: "2026-01-01",
          period_end: "2026-06-30",
        }),
      )
    ).output();

    expect(pdf).toContain("Main member: Anna Anderson \\(anna@example.com\\)");
    expect(pdf).toContain("Period: 1 January 2026 to 30 June 2026");
  });
});

describe("toPdfText", () => {
  it("keeps what the PDF fonts can show", () => {
    expect(toPdfText("Zoë Müller-Çelik €5")).toBe("Zoë Müller-Çelik €5");
  });

  it("replaces letters the PDF fonts cannot show by their plain letter, or a question mark", () => {
    expect(toPdfText("Łukasz Novák Ž")).toBe("?ukasz Novák Z");
    expect(toPdfText("李明")).toBe("??");
  });
});

describe("reportFileName", () => {
  it("is the year and the address", () => {
    expect(reportFileName({ address: "Hoofdstraat 12 A", year: 2026 })).toBe("charging-report-2026-hoofdstraat-12-a.pdf");
  });

  it("leaves out accents and odd characters", () => {
    expect(reportFileName({ address: "Zoë O'Brienlaan 3", year: 2025 })).toBe("charging-report-2025-zoe-o-brienlaan-3.pdf");
  });

  it("copes with an address without letters", () => {
    expect(reportFileName({ address: "李明", year: 2026 })).toBe("charging-report-2026-address.pdf");
  });

  it("appends the main member name when provided so mid-year reports have distinct file names", () => {
    expect(reportFileName({ address: "Hoofdstraat 12", year: 2026, main_resident: "Anna Anderson" })).toBe(
      "charging-report-2026-hoofdstraat-12-anna-anderson.pdf",
    );
  });
});
