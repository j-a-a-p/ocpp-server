import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import MyCardsCard from "./MyCardsCard";
import RefusedCardsCard from "./RefusedCardsCard";

// Ant Design confirms an edit on the keyCode of Enter, which userEvent.type("{Enter}") does not set.
const pressEnter = (element: HTMLElement) => {
  fireEvent.keyDown(element, { key: "Enter", keyCode: 13 });
  fireEvent.keyUp(element, { key: "Enter", keyCode: 13 });
};

describe("MyCardsCard", () => {
  const cards = [
    { rfid: "04AABBCC", name: "Tesla", resident_id: 1 },
    { rfid: "04DDEEFF", name: "", resident_id: 1 },
  ];

  it("lists the cards with their number and the count", () => {
    renderWithProviders(<MyCardsCard cards={cards} loading={false} onRename={vi.fn()} />);

    expect(screen.getByText("Tesla")).toBeInTheDocument();
    expect(screen.getByText("04AABBCC")).toBeInTheDocument();
    expect(screen.getByText("Unnamed card")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("explains when there are no cards", () => {
    renderWithProviders(<MyCardsCard cards={[]} loading={false} onRename={vi.fn()} />);

    expect(screen.getByText("No cards linked to your account yet")).toBeInTheDocument();
  });

  it("renames a card with the trimmed new name", async () => {
    const onRename = vi.fn();
    renderWithProviders(<MyCardsCard cards={[cards[0]]} loading={false} onRename={onRename} />);

    await userEvent.click(screen.getByRole("button", { name: /rename card/i }));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "  Nissan Leaf  ");
    pressEnter(input);

    expect(onRename).toHaveBeenCalledExactlyOnceWith("04AABBCC", "Nissan Leaf");
  });

  it("does not rename when the name stays the same", async () => {
    const onRename = vi.fn();
    renderWithProviders(<MyCardsCard cards={[cards[0]]} loading={false} onRename={onRename} />);

    await userEvent.click(screen.getByRole("button", { name: /rename card/i }));
    pressEnter(screen.getByRole("textbox"));

    expect(onRename).not.toHaveBeenCalled();
  });
});

describe("RefusedCardsCard", () => {
  const refused = [{ id: 5, rfid: "DEADBEEF", station_id: "CP1", created: "2026-11-22T08:00:00" }];

  it("explains when no card was refused", () => {
    renderWithProviders(<RefusedCardsCard refusedCards={[]} onAdd={vi.fn()} />);

    expect(screen.getByText(/No refused cards/)).toBeInTheDocument();
  });

  it("shows where a card was refused", () => {
    renderWithProviders(<RefusedCardsCard refusedCards={refused} onAdd={vi.fn()} />);

    expect(screen.getByText("Refused at CP1")).toBeInTheDocument();
    expect(screen.getByText("DEADBEEF")).toBeInTheDocument();
  });

  it("asks for confirmation before adding the card", async () => {
    const onAdd = vi.fn();
    renderWithProviders(<RefusedCardsCard refusedCards={refused} onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /add as my card/i }));

    expect(onAdd).not.toHaveBeenCalled();
    const confirm = await screen.findByText("Add this card?");
    await userEvent.click(within(confirm.closest(".ant-popover") as HTMLElement).getByRole("button", { name: /add card/i }));

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("CP1");
  });
});
