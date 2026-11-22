const HAS_ZONE = /(Z|[+-]\d\d:?\d\d)$/i;

// The API stores UTC timestamps and serializes them without a timezone suffix.
export const parseUtc = (value: string) => new Date(value.includes("T") && !HAS_ZONE.test(value) ? `${value}Z` : value);

/** A length of time for people: "5 min", "3 h 20 min", "2 d 4 h". Only the two largest units are shown. */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
};
