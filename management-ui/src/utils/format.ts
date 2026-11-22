// Every number in the UI goes through these functions, so they all get thousands separators (1,234.50).
// The locale is fixed, not the one of the browser, so the numbers look the same for everybody and in tests.
// Do not use them for years and other identifiers: 2026 is not 2,026.
const NUMBER_LOCALE = "en-US";

export const formatNumber = (value: number | string, digits = 2): string =>
  new Intl.NumberFormat(NUMBER_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value));

export const formatInteger = (value: number | string): string => formatNumber(value, 0);

export const formatEuro = (value: number | string, digits = 2): string => `€${formatNumber(value, digits)}`;

export const formatKwh = (value: number | string, digits = 2): string => `${formatNumber(value, digits)} kWh`;
