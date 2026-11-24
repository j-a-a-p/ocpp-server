import { describe, expect, it } from "vitest";
import { addressKey, addressLabel, addressSuggestions, formatAddress, groupByAddress, NO_ADDRESS } from "./address";

const at = (
  street_name: string | null,
  house_number: string | null = null,
  house_number_suffix: string | null = null,
  zip_code: string | null = null,
  city: string | null = null,
) => ({ street_name, house_number, house_number_suffix, zip_code, city });

describe("formatAddress", () => {
  it("joins street, number and suffix", () => {
    expect(formatAddress(at("Hoofdstraat", "12", "A"))).toBe("Hoofdstraat 12 A");
    expect(formatAddress(at("Hoofdstraat", "12"))).toBe("Hoofdstraat 12");
  });
});

describe("addressKey and addressLabel", () => {
  it("is the same for spellings that differ in case or spaces, and for another zip code or city", () => {
    expect(addressKey(at(" hoofdstraat ", "12", "a", "1111 AA", "X"))).toBe(addressKey(at("Hoofdstraat", "12", "A", "2222 BB", "Y")));
  });

  it("tells apart another number or suffix", () => {
    expect(addressKey(at("Hoofdstraat", "12"))).not.toBe(addressKey(at("Hoofdstraat", "12", "A")));
    expect(addressKey(at("Hoofdstraat", "12"))).not.toBe(addressKey(at("Hoofdstraat", "14")));
  });

  it("is one shared key for everybody without an address", () => {
    expect(addressKey(at(null))).toBe(NO_ADDRESS);
    expect(addressKey({})).toBe(NO_ADDRESS);
    expect(addressLabel(at(null))).toBe("No address");
    expect(addressLabel(at("Hoofdstraat", "12", "A"))).toBe("Hoofdstraat 12 A");
  });
});

describe("addressSuggestions", () => {
  const options = [at("Hoofdstraat", "2"), at("Hoofdstraat", "12"), at("Hoofdstraat", "12", "A"), at("Kerkstraat", "3", "B")];

  it("offers every street, each once", () => {
    expect(addressSuggestions(options, {}).street_name).toEqual(["Hoofdstraat", "Kerkstraat"]);
  });

  it("offers the numbers of the chosen street in numeric order, ignoring case", () => {
    expect(addressSuggestions(options, { street_name: "hoofdstraat" }).house_number).toEqual(["2", "12"]);
  });

  it("offers the suffixes of the chosen house", () => {
    expect(addressSuggestions(options, { street_name: "Hoofdstraat", house_number: "12" }).house_number_suffix).toEqual(["A"]);
    expect(addressSuggestions(options, { street_name: "Hoofdstraat", house_number: "2" }).house_number_suffix).toEqual([]);
  });

  it("offers everything for a street that is new", () => {
    expect(addressSuggestions(options, { street_name: "Nieuwstraat" }).house_number).toEqual([]);
  });

  it("narrows the zip code and the city to the street, and the streets to the city", () => {
    const places = [
      at("Hoofdstraat", "12", null, "3511 AB", "Utrecht"),
      at("Kerkstraat", "3", null, "3512 CD", "Utrecht"),
      at("Dorpsweg", "1", null, "3811 AA", "Amersfoort"),
    ];

    expect(addressSuggestions(places, { street_name: "Hoofdstraat" }).zip_code).toEqual(["3511 AB"]);
    expect(addressSuggestions(places, { street_name: "Hoofdstraat" }).city).toEqual(["Utrecht"]);
    expect(addressSuggestions(places, { city: "Utrecht" }).street_name).toEqual(["Hoofdstraat", "Kerkstraat"]);
  });
});

describe("groupByAddress", () => {
  const person = (id: number, full_name: string, address = at(null), household_head_id: number | null = null) => ({
    id, full_name, household_head_id, ...address,
  });

  it("orders the addresses by street, then number as a number, then suffix, and the accounts without address last", () => {
    const groups = groupByAddress([
      person(1, "A", at("Kerkstraat", "3", "B")),
      person(2, "B"),
      person(3, "C", at("Kerkstraat", "10")),
      person(4, "D", at("Kerkstraat", "3", "A")),
      person(5, "E", at("Hoofdstraat", "12")),
    ]);

    expect(groups.map((group) => group.address)).toEqual([
      "Hoofdstraat 12", "Kerkstraat 3 A", "Kerkstraat 3 B", "Kerkstraat 10", null,
    ]);
  });

  it("treats spelling differences in case as one address", () => {
    const groups = groupByAddress([person(1, "A", at("Hoofdstraat", "12")), person(2, "B", at("hoofdstraat", "12"))]);

    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("puts the resident first and then their household members, each in order of name", () => {
    const home = at("Hoofdstraat", "12");
    const [group] = groupByAddress([
      person(3, "Zoe", home, 1),
      person(1, "Wim", home),
      person(2, "Ann", home, 1),
    ]);

    expect(group.members.map((member) => member.full_name)).toEqual(["Wim", "Ann", "Zoe"]);
  });
});
