import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch, requests } from "../test/mockFetch";
import { addCard, getMyCards, getRefusedCards, updateCardName } from "./cardService";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const refused = (id: number, rfid: string, station_id = "CP1") => ({ id, rfid, station_id, created: "2026-11-22T08:00:00" });

describe("getRefusedCards", () => {
  it("is an empty list when the API has none (it answers 404)", async () => {
    mockFetch({ "GET /cards/refused": json({ detail: "No refused cards found" }, 404) });

    expect(await getRefusedCards()).toEqual([]);
  });

  it("removes the same card tried more than once at the same station", async () => {
    mockFetch({
      "GET /cards/refused": json({ refused_cards: [refused(3, "AAAA0001"), refused(2, "AAAA0001"), refused(1, "BBBB0002")] }),
    });

    const cards = await getRefusedCards();

    expect(cards.map((card) => card.id)).toEqual([3, 1]);
  });

  it("keeps the same card when it was refused at two stations", async () => {
    mockFetch({ "GET /cards/refused": json({ refused_cards: [refused(2, "AAAA0001", "CP2"), refused(1, "AAAA0001", "CP1")] }) });

    expect(await getRefusedCards()).toHaveLength(2);
  });

  it("fails on a server error", async () => {
    mockFetch({ "GET /cards/refused": json({}, 500) });

    await expect(getRefusedCards()).rejects.toThrow("Failed to fetch refused cards");
  });
});

describe("getMyCards", () => {
  it("returns the cards of the response", async () => {
    mockFetch({ "GET /cards/my_cards": json({ cards: [{ rfid: "04AABBCC", name: "Tesla", resident_id: 1 }] }) });

    expect(await getMyCards()).toEqual([{ rfid: "04AABBCC", name: "Tesla", resident_id: 1 }]);
  });

  it("fails on an error", async () => {
    mockFetch({ "GET /cards/my_cards": json({}, 401) });

    await expect(getMyCards()).rejects.toThrow("Failed to fetch cards");
  });
});

describe("addCard", () => {
  it("adds the last refused card of the station", async () => {
    const fetchMock = mockFetch({ "POST /cards/add_card/CP1": json({ rfid: "AAAA0001", name: "AAAA0001", resident_id: 1 }) });

    const card = await addCard("CP1");

    expect(card.rfid).toBe("AAAA0001");
    expect(requests(fetchMock)).toEqual([expect.stringMatching(/^POST .*\/cards\/add_card\/CP1$/)]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("fails when there is nothing to add", async () => {
    mockFetch({ "POST /cards/add_card/CP1": json({ detail: "No recent refused card found" }, 404) });

    await expect(addCard("CP1")).rejects.toThrow("Failed to add card");
  });
});

describe("updateCardName", () => {
  it("sends the new name", async () => {
    const fetchMock = mockFetch({ "PUT /cards/04AABBCC/name": json({ rfid: "04AABBCC", name: "Leaf", resident_id: 1 }) });

    await updateCardName("04AABBCC", "Leaf");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ name: "Leaf" }), credentials: "include" });
  });

  it("fails on an error", async () => {
    mockFetch({ "PUT /cards/04AABBCC/name": json({}, 404) });

    await expect(updateCardName("04AABBCC", "Leaf")).rejects.toThrow("Failed to update card name");
  });
});
