const HAS_ZONE = /(Z|[+-]\d\d:?\d\d)$/i;

// The API stores UTC timestamps and serializes them without a timezone suffix.
export const parseUtc = (value: string) => new Date(value.includes("T") && !HAS_ZONE.test(value) ? `${value}Z` : value);
