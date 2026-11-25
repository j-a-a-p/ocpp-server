import dayjs from "dayjs";

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

export type ResidencyState = "upcoming" | "active" | "ended";

export interface HouseholdFields extends Address {
  id: number;
  full_name: string;
  household_id?: number | null;
  is_main_member?: boolean;
  household_head_id: number | null;
  residency_start_date?: string | null;
  residency_end_date?: string | null;
  residency_state?: ResidencyState | null;
}

export interface HouseholdGroup<T> {
  household_id: number | null;
  start_date: string | null;
  end_date: string | null;
  state: ResidencyState;
  mainMember: T | null;
  members: T[];
}

export interface AddressGroup<T> {
  key: string;
  /** The address, or null for the accounts that have none. */
  address: string | null;
  /** Full address fields of the address (for pre-filling "Add new resident"). */
  sampleAddress: Address;
  members: T[];
  households: HouseholdGroup<T>[];
  /** The current open-ended household, or the household with the latest end date. */
  latestHousehold: HouseholdGroup<T> | null;
  activeOrUpcomingHouseholds: HouseholdGroup<T>[];
  endedHouseholds: HouseholdGroup<T>[];
}

export const residencyStateOf = (
  item: Pick<HouseholdFields, "residency_start_date" | "residency_end_date" | "residency_state">,
  today: string = dayjs().format("YYYY-MM-DD"),
): ResidencyState => {
  if (item.residency_state) return item.residency_state;
  if (item.residency_end_date && today > item.residency_end_date) return "ended";
  if (item.residency_start_date && today < item.residency_start_date) return "upcoming";
  return "active";
};

const stateOrder: Record<ResidencyState, number> = { active: 0, upcoming: 1, ended: 2 };

const byHouseholdOrder = <T>(a: HouseholdGroup<T>, b: HouseholdGroup<T>) => {
  if (stateOrder[a.state] !== stateOrder[b.state]) return stateOrder[a.state] - stateOrder[b.state];
  // Active/upcoming ordered earliest start first; ended ordered most recently ended first.
  if (a.state === "ended") {
    return (b.end_date ?? "").localeCompare(a.end_date ?? "");
  }
  return (a.start_date ?? "").localeCompare(b.start_date ?? "");
};

const pickLatestHousehold = <T>(households: HouseholdGroup<T>[]): HouseholdGroup<T> | null => {
  if (households.length === 0) return null;
  const openEnded = households.find((h) => h.end_date === null);
  if (openEnded) return openEnded;
  return [...households].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];
};

const orderHouseholdMembers = <T extends HouseholdFields>(members: T[]): T[] => {
  const byName = (a: T, b: T) => a.full_name.localeCompare(b.full_name);
  const ids = new Set(members.map((member) => member.id));
  const isMain = (member: T) =>
    member.is_main_member === true ||
    (member.is_main_member === undefined && (member.household_head_id === null || !ids.has(member.household_head_id)));
  const mains = members.filter(isMain).sort(byName);
  const others = members.filter((member) => !isMain(member)).sort(byName);
  return [...mains, ...others];
};

/**
 * Groups residents at one address into their households.
 */
export const groupHouseholds = <T extends HouseholdFields>(
  members: T[],
  today: string = dayjs().format("YYYY-MM-DD"),
): HouseholdGroup<T>[] => {
  const byId = new Map<string, T[]>();
  const ids = new Set(members.map((member) => member.id));

  for (const member of members) {
    const key =
      member.household_id != null
        ? `h:${member.household_id}`
        : member.household_head_id != null && ids.has(member.household_head_id)
          ? `head:${member.household_head_id}`
          : `head:${member.id}`;
    const list = byId.get(key);
    if (list) list.push(member);
    else byId.set(key, [member]);
  }

  return [...byId.values()]
    .map((groupMembers) => {
      const ordered = orderHouseholdMembers(groupMembers);
      const sample = ordered[0];
      const mainMember =
        ordered.find((member) => member.is_main_member === true) ??
        ordered.find((member) => member.household_head_id === null) ??
        sample ??
        null;
      return {
        household_id: sample.household_id ?? null,
        start_date: sample.residency_start_date ?? null,
        end_date: sample.residency_end_date ?? null,
        state: residencyStateOf(sample, today),
        mainMember,
        members: ordered,
      };
    })
    .sort(byHouseholdOrder);
};

/**
 * Groups accounts by address. The addresses are in the order street name, house number (numerically) and suffix,
 * the accounts without an address come last. Within an address households are ordered active, upcoming, then ended,
 * with the main member first followed by household members in order of name.
 */
export const groupByAddress = <T extends HouseholdFields>(
  residents: T[],
  today: string = dayjs().format("YYYY-MM-DD"),
): AddressGroup<T>[] => {
  const groups = new Map<string, { sample: T; members: T[] }>();
  for (const resident of residents) {
    const key = addressKey(resident);
    const group = groups.get(key);
    if (group) group.members.push(resident);
    else groups.set(key, { sample: resident, members: [resident] });
  }

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
    .map(([key, group]) => {
      const households = key === NO_ADDRESS ? [] : groupHouseholds(group.members, today);
      const members =
        key === NO_ADDRESS
          ? [...group.members].sort((a, b) => a.full_name.localeCompare(b.full_name))
          : households.flatMap((household) => household.members);
      const latestHousehold = key === NO_ADDRESS ? null : pickLatestHousehold(households);
      const activeOrUpcomingHouseholds = households.filter((h) => h.state !== "ended");
      const endedHouseholds = households.filter((h) => h.state === "ended");
      const addressSample = latestHousehold?.mainMember ?? group.sample;
      return {
        key,
        address: key === NO_ADDRESS ? null : formatAddress(addressSample),
        sampleAddress: {
          street_name: addressSample.street_name,
          house_number: addressSample.house_number,
          house_number_suffix: addressSample.house_number_suffix,
          zip_code: addressSample.zip_code,
          city: addressSample.city,
        },
        members,
        households,
        latestHousehold,
        activeOrUpcomingHouseholds,
        endedHouseholds,
      };
    });
};
