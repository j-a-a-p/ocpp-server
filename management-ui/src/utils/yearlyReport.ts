import type { ChargeTransaction } from "../services/chargeTransactionService";
import { addressKey, addressLabel } from "./address";
import { parseUtc } from "./dates";

export interface ReportSession {
  id: number;
  started: Date;
  /** The last measurement of the charge, empty when there is none. */
  ended: Date | null;
  station: string;
  card: string;
  /** Who charged: more than one person can live in the household. */
  resident: string;
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
  /** The address the report is about, as shown. */
  address: string;
  address_key: string;
  household_id?: number | null;
  /** The main member who receives invoices and updates. */
  main_resident?: string | null;
  main_resident_email?: string | null;
  /** Residency period clipped to the report year (YYYY-MM-DD), when partial year. */
  period_start?: string;
  period_end?: string;
  /** Everybody who charged in this household that year, in order of name. */
  residents: string[];
  year: number;
  generated: Date;
  total_energy: number;
  /** What the household has to pay for the year. */
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
 * Grouping key for billing: splits consecutive households at the same address by household_id,
 * falling back to addressKey when no household_id is present.
 */
export const billingGroupKey = (transaction: Pick<ChargeTransaction, "household_id" | "street_name" | "house_number" | "house_number_suffix">): string =>
  transaction.household_id != null ? `household:${transaction.household_id}` : addressKey(transaction);

const clipPeriodToYear = (year: number, startDate?: string | null, endDate?: string | null) => {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const period_start = startDate && startDate > yearStart ? startDate : yearStart;
  const period_end = endDate && endDate < yearEnd ? endDate : yearEnd;
  return { period_start, period_end };
};

/**
 * Everything charged by one household (or address) in one year. Follows the same rules as the yearly
 * summaries on the Charges page (a charge that delivered no energy does not count, the year is the year the charge started),
 * so the totals of the report match the totals of that table.
 */
export const buildYearlyReport = (
  transactions: ChargeTransaction[],
  group_key: string,
  year: number,
  generated: Date = new Date()
): YearlyReport => {
  const matches = (transaction: ChargeTransaction) =>
    group_key.startsWith("household:")
      ? billingGroupKey(transaction) === group_key
      : addressKey(transaction) === group_key;

  const matching = transactions.filter(matches);
  const sessions: ReportSession[] = matching
    .filter(
      (transaction) =>
        transaction.final_energy_kwh > 0 &&
        parseUtc(transaction.created).getFullYear() === year
    )
    .map((transaction) => ({
      id: transaction.id,
      started: parseUtc(transaction.created),
      ended: transaction.ended ? parseUtc(transaction.ended) : null,
      station: transaction.station_id,
      card: transaction.card_name || transaction.rfid,
      resident: transaction.resident_name,
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

  const sample = matching[0];
  const { period_start, period_end } = clipPeriodToYear(year, sample?.residency_start_date, sample?.residency_end_date);

  return {
    address: addressLabel(sample ?? {}),
    address_key: sample ? addressKey(sample) : group_key,
    household_id: sample?.household_id ?? null,
    main_resident: sample?.main_resident_name ?? null,
    main_resident_email: sample?.main_resident_email ?? null,
    period_start,
    period_end,
    residents: [...new Set(sessions.map((session) => session.resident))].sort((a, b) => a.localeCompare(b)),
    year,
    generated,
    total_energy: sessions.reduce((sum, session) => sum + session.energy, 0),
    total_cost: sessions.reduce((sum, session) => sum + session.cost, 0),
    sessions,
    months: Array.from(months.values()).sort((a, b) => a.month - b.month),
  };
};
