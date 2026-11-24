export interface Address {
  street_name: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  zip_code: string | null;
  city: string | null;
}

/** "Hoofdstraat 12 A". The zip code and the city are left out: they hardly tell addresses apart in the grouped view. */
export const formatAddress = ({ street_name, house_number, house_number_suffix }: Partial<Address>): string =>
  [street_name, [house_number, house_number_suffix].filter(Boolean).join(" ")].filter(Boolean).join(" ");

/** The key of the empty address, shared by everybody without one. */
export const NO_ADDRESS = "";

export const NO_ADDRESS_LABEL = "No address";

/**
 * What makes two addresses the same one: street, house number and suffix, ignoring case and spaces around them.
 * Zip code and city are left out, like in the grouped views. Everybody without a street has the key NO_ADDRESS.
 */
export const addressKey = ({ street_name, house_number, house_number_suffix }: Partial<Address>): string =>
  street_name
    ? [street_name, house_number, house_number_suffix].map((part) => (part ?? "").trim().toLowerCase()).join("|")
    : NO_ADDRESS;

/** The address to show in a grouped view. */
export const addressLabel = (address: Partial<Address>): string => (addressKey(address) === NO_ADDRESS ? NO_ADDRESS_LABEL : formatAddress(address));

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const distinct = (values: (string | null)[]): string[] => {
  const seen = new Map<string, string>();
  for (const value of values) {
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()];
};

const compareNumbers = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

const FIELDS = ["street_name", "house_number", "house_number_suffix", "zip_code", "city"] as const;

/**
 * The values to suggest in the address fields. Each field offers the distinct values of the addresses that
 * match everything already filled in, so the lists stay the small variations of one address.
 */
export const addressSuggestions = (options: Address[], chosen: Partial<Record<(typeof FIELDS)[number], string>>) => {
  const narrowed = (field: (typeof FIELDS)[number]) =>
    options.filter((option) =>
      FIELDS.every((other) => other === field || !chosen[other]?.trim() || same(option[other], chosen[other])),
    );
  const values = (field: (typeof FIELDS)[number]) => distinct(narrowed(field).map((option) => option[field]));
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    street_name: values("street_name").sort(byName),
    house_number: values("house_number").sort(compareNumbers),
    house_number_suffix: values("house_number_suffix").sort(byName),
    zip_code: values("zip_code").sort(byName),
    city: values("city").sort(byName),
  };
};

export interface HouseholdFields extends Address {
  id: number;
  full_name: string;
  household_head_id: number | null;
}

export interface AddressGroup<T> {
  key: string;
  /** The address, or null for the accounts that have none. */
  address: string | null;
  members: T[];
}

/**
 * Groups accounts by address. The addresses are in the order street name, house number (numerically) and suffix,
 * the accounts without an address come last. Within an address the resident who invited a household comes first,
 * followed by the household members, each in order of name.
 */
export const groupByAddress = <T extends HouseholdFields>(residents: T[]): AddressGroup<T>[] => {
  const groups = new Map<string, { sample: T; members: T[] }>();
  for (const resident of residents) {
    const key = addressKey(resident);
    const group = groups.get(key);
    if (group) group.members.push(resident);
    else groups.set(key, { sample: resident, members: [resident] });
  }

  const byName = (a: T, b: T) => a.full_name.localeCompare(b.full_name);
  const inHouseholdOrder = (members: T[]): T[] => {
    const ids = new Set(members.map((member) => member.id));
    const heads = members.filter((member) => member.household_head_id === null || !ids.has(member.household_head_id)).sort(byName);
    const ordered = heads.flatMap((head) => [head, ...members.filter((member) => member.household_head_id === head.id).sort(byName)]);
    return ordered;
  };

  return [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      if (keyA === NO_ADDRESS) return keyB === NO_ADDRESS ? 0 : 1;
      if (keyB === NO_ADDRESS) return -1;
      return (
        (a.sample.street_name ?? "").localeCompare(b.sample.street_name ?? "") ||
        compareNumbers(a.sample.house_number ?? "", b.sample.house_number ?? "") ||
        (a.sample.house_number_suffix ?? "").localeCompare(b.sample.house_number_suffix ?? "")
      );
    })
    .map(([key, group]) => ({
      key,
      address: key === NO_ADDRESS ? null : formatAddress(group.sample),
      members: inHouseholdOrder(group.members),
    }));
};
