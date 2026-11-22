import type { ChargeTransaction } from "../services/chargeTransactionService";

export const formatEuro = (value: number) => `€${value.toFixed(2)}`;

export const formatKwh = (value: number, digits = 1) => `${value.toFixed(digits)} kWh`;

// The API stores UTC timestamps and serializes them without a timezone suffix.
export const parseUtc = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

export const transactionCost = (transaction: ChargeTransaction) =>
  (transaction.power_logs ?? []).reduce((sum, log) => sum + (log.delta_power_cost || 0), 0);
