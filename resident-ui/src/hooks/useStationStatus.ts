import { useEffect, useState } from "react";
import { getAllCurrentResidentTransactions } from "../services/chargeTransactionService";

export type StationState = "available" | "mine" | "other" | "unknown";

export interface MeterValues {
  timestamp: string;
  connectorId: number;
  transactionId: number;
  context: string;
  data: {
    "Current.Offered": number;
    "Current.Import.L1": number;
    "Current.Import.L2": number;
    "Current.Import.L3": number;
    "Voltage.L1": number;
    "Voltage.L2": number;
    "Voltage.L3": number;
    "Energy.Active.Import.Register": number;
    "Power.Active.Import": number;
  };
}

interface StationStatus {
  state: StationState;
  meterValues: MeterValues | null;
  lastUpdate: Date | null;
  loaded: boolean;
}

const FRESH_WINDOW_MS = 2 * 60 * 1000;

const isResidentTransaction = async (transactionId: number) => {
  try {
    const transactions = await getAllCurrentResidentTransactions();
    return transactions.some((transaction) => transaction.id === transactionId);
  } catch (error) {
    console.error("Error checking resident charging status:", error);
    return false;
  }
};

const readStation = async (): Promise<Omit<StationStatus, "loaded">> => {
  try {
    const response = await fetch("/meter_values.json", { cache: "no-store" });
    if (!response.ok) {
      return { state: "unknown", meterValues: null, lastUpdate: null };
    }
    const data: MeterValues = await response.json();
    const fresh = Date.now() - new Date(data.timestamp).getTime() < FRESH_WINDOW_MS;
    let state: StationState = "available";
    if (fresh) {
      state = data.transactionId && (await isResidentTransaction(data.transactionId)) ? "mine" : "other";
    }
    return { state, meterValues: data, lastUpdate: new Date() };
  } catch (error) {
    console.error("Error fetching meter values:", error);
    return { state: "unknown", meterValues: null, lastUpdate: null };
  }
};

export const useStationStatus = (pollMs = 10000): StationStatus => {
  const [status, setStatus] = useState<StationStatus>({
    state: "unknown",
    meterValues: null,
    lastUpdate: null,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const next = await readStation();
      if (!cancelled) {
        setStatus((previous) => ({
          ...next,
          meterValues: next.meterValues ?? previous.meterValues,
          lastUpdate: next.lastUpdate ?? previous.lastUpdate,
          loaded: true,
        }));
      }
    };
    poll();
    const interval = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  return status;
};
