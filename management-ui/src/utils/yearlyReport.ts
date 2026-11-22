import type { ChargeTransaction } from "../services/chargeTransactionService";
import { parseUtc } from "./dates";

export interface ReportSession {
  id: number;
  started: Date;
  /** The last measurement of the charge, empty when there is none. */
  ended: Date | null;
  station: string;
  card: string;
  energy: number;
  cost: number;
}

export interface ReportMonth {
  month: number;
  name: string;
  sessions: number;
  energy: number;
  cost: number;
}

export interface YearlyReport {
  resident_name: string;
  year: number;
  generated: Date;
  total_energy: number;
  /** What the resident has to pay for the year. */
  total_cost: number;
  /** Oldest first. */
  sessions: ReportSession[];
  /** January first, only the months with a charge. */
  months: ReportMonth[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Everything one resident charged in one year. It follows the same rules as the yearly summaries on the
 * Charges page (a charge that delivered no energy does not count, the year is the year the charge started),
 * so the totals of the report are the totals of that table.
 */
export const buildYearlyReport = (
  transactions: ChargeTransaction[],
  resident_name: string,
  year: number,
  generated: Date = new Date()
): YearlyReport => {
  const sessions: ReportSession[] = transactions
    .filter(
      (transaction) =>
        transaction.resident_name === resident_name &&
        transaction.final_energy_kwh > 0 &&
        parseUtc(transaction.created).getFullYear() === year
    )
    .map((transaction) => ({
      id: transaction.id,
      started: parseUtc(transaction.created),
      ended: transaction.ended ? parseUtc(transaction.ended) : null,
      station: transaction.station_id,
      card: transaction.card_name || transaction.rfid,
      energy: transaction.final_energy_kwh,
      cost: transaction.total_cost || 0,
    }))
    .sort((a, b) => a.started.getTime() - b.started.getTime());

  const months = new Map<number, ReportMonth>();
  for (const session of sessions) {
    const month = session.started.getMonth() + 1;
    const entry = months.get(month) ?? { month, name: MONTH_NAMES[month - 1], sessions: 0, energy: 0, cost: 0 };
    entry.sessions += 1;
    entry.energy += session.energy;
    entry.cost += session.cost;
    months.set(month, entry);
  }

  return {
    resident_name,
    year,
    generated,
    total_energy: sessions.reduce((sum, session) => sum + session.energy, 0),
    total_cost: sessions.reduce((sum, session) => sum + session.cost, 0),
    sessions,
    months: Array.from(months.values()).sort((a, b) => a.month - b.month),
  };
};
