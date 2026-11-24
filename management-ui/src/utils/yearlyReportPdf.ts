import dayjs from "dayjs";
import type { jsPDF } from "jspdf";
import { formatEuro, formatInteger, formatNumber } from "./format";
import type { YearlyReport } from "./yearlyReport";

type Color = [number, number, number];

// The colors of the app (the teal of the logo).
const TEAL: Color = [13, 148, 136];
const TEAL_LIGHT: Color = [226, 245, 242];
const INK: Color = [30, 41, 59];
const MUTED: Color = [100, 116, 139];
const LINE: Color = [226, 232, 240];
const STRIPE: Color = [248, 250, 252];
const WHITE: Color = [255, 255, 255];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const TOP_OF_NEXT_PAGES = 20;
const FOOTER_SPACE = 18;

/**
 * The PDF fonts have no Unicode: they know the Western European letters and the euro sign.
 * Other characters would come out as garbage, so they become their plain letter, or a question mark.
 */
export const toPdfText = (text: string): string =>
  Array.from(text.normalize("NFC"))
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code <= 0xff || character === "€") return character;
      const plain = character.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return plain.length === 1 && plain.charCodeAt(0) <= 0xff ? plain : "?";
    })
    .join("");

export const reportFileName = (report: Pick<YearlyReport, "address" | "year">): string => {
  const slug = report.address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `charging-report-${report.year}-${slug || "address"}.pdf`;
};

const formatDuration = (started: Date, ended: Date | null): string => {
  if (!ended) return "-";
  const minutes = Math.round((ended.getTime() - started.getTime()) / 60000);
  if (minutes < 1) return "< 1 min";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${formatInteger(hours)} h ${minutes % 60} min` : `${minutes} min`;
};

const formatTimes = (started: Date, ended: Date | null): string =>
  ended ? `${dayjs(started).format("HH:mm")} - ${dayjs(ended).format("HH:mm")}` : dayjs(started).format("HH:mm");

/** A nice report of what was charged at one address in one year, and what has to be paid for it. */
export const createYearlyReportPdf = async (report: YearlyReport): Promise<jsPDF> => {
  // Loaded when a report is made, so the PDF library is not part of the pages that do not need it.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const name = toPdfText(report.address);
  const title = `Charging report ${report.year}`;
  const text = (value: string, x: number, y: number, align: "left" | "right" = "left") =>
    doc.text(value, x, y, { align });

  doc.setProperties({
    title: `${title} - ${name}`,
    subject: `Charging sessions and amount to pay at ${name} in ${report.year}`,
  });

  // Header band with the logo
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_WIDTH, 38, "F");
  doc.setFillColor(...WHITE);
  doc.roundedRect(MARGIN, 11, 12, 12, 3, 3, "F");
  doc.setFillColor(...TEAL);
  doc.lines(
    [[-4, 5.4], [2.5, 0], [-1.6, 4.4], [4.6, -5.9], [-2.6, 0], [1.1, -3.9]],
    21.5, 12.5, [1, 1], "F", true
  );
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  text("Charging report", MARGIN + 17, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  text("Yearly statement of electric vehicle charging", MARGIN + 17, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  text(String(report.year), PAGE_WIDTH - MARGIN, 24, "right");

  // Who it is for
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  text("PREPARED FOR", MARGIN, 49);
  text("REPORT DATE", PAGE_WIDTH - MARGIN, 49, "right");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  text(name, MARGIN, 57);
  doc.setFontSize(11);
  text(dayjs(report.generated).format("D MMMM YYYY"), PAGE_WIDTH - MARGIN, 57, "right");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  text(`Period: 1 January ${report.year} to 31 December ${report.year}`, MARGIN, 63);
  const residents = report.residents.map(toPdfText);
  if (residents.length > 0) {
    text(`${residents.length === 1 ? "Resident" : "Residents"}: ${residents.join(", ")}`, MARGIN, 68);
  }

  // The summary: the amount to pay stands out
  const cardTop = 75;
  const cardHeight = 27;
  const amountWidth = 84;
  const smallWidth = (CONTENT_WIDTH - amountWidth - 6) / 2;

  doc.setFillColor(...TEAL);
  doc.roundedRect(MARGIN, cardTop, amountWidth, cardHeight, 3, 3, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  text("AMOUNT TO PAY", MARGIN + 6, cardTop + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  text(formatEuro(report.total_cost), MARGIN + 6, cardTop + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  text(`for charging in ${report.year}`, MARGIN + 6, cardTop + 24);

  const smallCard = (x: number, label: string, value: string, note: string) => {
    doc.setFillColor(...TEAL_LIGHT);
    doc.roundedRect(x, cardTop, smallWidth, cardHeight, 3, 3, "F");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    text(label, x + 6, cardTop + 8);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    text(value, x + 6, cardTop + 18);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    text(note, x + 6, cardTop + 24);
  };
  const sessionCount = report.sessions.length;
  smallCard(MARGIN + amountWidth + 3, "TOTAL ENERGY", `${formatNumber(report.total_energy)} kWh`, "delivered to your cars");
  smallCard(
    MARGIN + amountWidth + 6 + smallWidth,
    "CHARGING SESSIONS",
    formatInteger(sessionCount),
    sessionCount === 1 ? "time you charged" : "times you charged"
  );

  // Tables
  let y = cardTop + cardHeight + 14;
  const bottomOfPage = () => PAGE_HEIGHT - FOOTER_SPACE;
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomOfPage()) {
      doc.addPage();
      y = TOP_OF_NEXT_PAGES;
    }
  };
  const sectionTitle = (value: string) => {
    ensureSpace(40);
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y - 4.2, 1.2, 5.6, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    text(value, MARGIN + 4, y);
    y += 4;
  };
  const endOfTable = () =>
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;

  const tableLook = (rightAligned: number[]) => ({
    margin: { top: TOP_OF_NEXT_PAGES, bottom: FOOTER_SPACE, left: MARGIN, right: MARGIN },
    theme: "plain" as const,
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 }, textColor: INK, lineColor: LINE, lineWidth: 0 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold" as const },
    footStyles: { fillColor: TEAL_LIGHT, textColor: INK, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: STRIPE },
    showFoot: "lastPage" as const,
    // Numbers on the right, in the head, the body and the foot
    didParseCell: (data: { column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (rightAligned.includes(data.column.index)) data.cell.styles.halign = "right";
    },
  });

  sectionTitle("Charges per month");
  y += 3;
  autoTable(doc, {
    ...tableLook([1, 2, 3]),
    startY: y,
    head: [["Month", "Sessions", "Energy (kWh)", "Cost"]],
    body: report.months.map((month) => [
      month.name,
      formatInteger(month.sessions),
      formatNumber(month.energy),
      formatEuro(month.cost),
    ]),
    foot: [["Total", formatInteger(sessionCount), formatNumber(report.total_energy), formatEuro(report.total_cost)]],
  });
  y = endOfTable() + 14;

  sectionTitle("When you charged");
  y += 3;
  // Who charged is only worth a column when more than one person lives at the address.
  const showResident = report.residents.length > 1;
  const numberColumns = showResident ? [6, 7] : [5, 6];
  autoTable(doc, {
    ...tableLook(numberColumns),
    startY: y,
    head: [["Date", "Time", "Duration", "Station", "Card", ...(showResident ? ["Resident"] : []), "Energy (kWh)", "Cost"]],
    body: report.sessions.map((session) => [
      dayjs(session.started).format("ddd D MMM YYYY"),
      formatTimes(session.started, session.ended),
      formatDuration(session.started, session.ended),
      toPdfText(session.station),
      toPdfText(session.card),
      ...(showResident ? [toPdfText(session.resident)] : []),
      formatNumber(session.energy),
      formatEuro(session.cost),
    ]),
    foot: [["Total", "", "", "", "", ...(showResident ? [""] : []), formatNumber(report.total_energy), formatEuro(report.total_cost)]],
  });
  y = endOfTable() + 10;

  // How the amount is made up
  const notes = [
    `The amount to pay is the cost of all charging sessions in ${report.year}, calculated per kWh of energy delivered.`,
    "Two rates apply: the Dal rate in the weekend and every day from 21:00 to 07:00 (Dutch time), and the Normaal rate at all other times.",
    "Dates and times are in the local time of the person who created this report.",
  ];
  doc.setFontSize(8);
  const wrapped = notes.flatMap((note) => doc.splitTextToSize(note, CONTENT_WIDTH - 6) as string[]);
  const boxHeight = wrapped.length * 4 + 10;
  ensureSpace(boxHeight);
  doc.setFillColor(...STRIPE);
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 2, 2, "FD");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  text("About this amount", MARGIN + 3, y + 5.5);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  wrapped.forEach((line, index) => text(line, MARGIN + 3, y + 10.5 + index * 4));

  // Footer on every page, and a small header on the pages after the first
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 12);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    text(`${title} - ${name}`, MARGIN, PAGE_HEIGHT - 7);
    text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 7, "right");
    if (page > 1) {
      doc.setTextColor(...TEAL);
      doc.setFont("helvetica", "bold");
      text(`${title} - ${name}`, MARGIN, 11);
      doc.setDrawColor(...TEAL);
      doc.line(MARGIN, 14, PAGE_WIDTH - MARGIN, 14);
    }
  }

  return doc;
};

export const downloadYearlyReportPdf = async (report: YearlyReport): Promise<void> => {
  const doc = await createYearlyReportPdf(report);
  doc.save(reportFileName(report));
};
