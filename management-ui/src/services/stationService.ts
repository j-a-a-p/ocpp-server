import { API_BASE_URL } from '../config';

export interface OnlinePeriod {
  start: string;
  /** The end of the window while the station is still online. */
  end: string;
}

export interface Station {
  station_id: string;
  online: boolean;
  /** Only while the station is online. */
  connected_since: string | null;
  /** The last message of the station, or the moment it disconnected. */
  last_seen: string;
  first_seen: string;
  /** Of the window, counted from the first connection when that is later. */
  uptime_percent: number | null;
  /** How many times the station came online in the window. */
  connections: number;
  /** In time order, never overlapping, cut off at the window. */
  online_periods: OnlinePeriod[];
}

export interface StationOverview {
  generated_at: string;
  window_start: string;
  window_hours: number;
  online_count: number;
  /** By station id. */
  stations: Station[];
}

export const getStations = async (hours: number): Promise<StationOverview> => {
  const response = await fetch(`${API_BASE_URL}/stations/?hours=${hours}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch stations');
  }

  return response.json();
};
