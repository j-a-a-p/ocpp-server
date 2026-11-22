import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ThemeToggle from "../components/ThemeToggle";
import { setSystemDark } from "../test/matchMedia";
import { ThemeProvider } from "./ThemeProvider";
import { useThemeMode } from "./themeContext";

const Probe = () => {
  const { preference, isDark } = useThemeMode();
  return <p data-testid="probe">{`${preference}:${isDark ? "dark" : "light"}`}</p>;
};

const renderTheme = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
      <Probe />
    </ThemeProvider>
  );

const theme = () => document.documentElement.dataset.theme;

describe("theme", () => {
  it("follows the system by default", () => {
    renderTheme();

    expect(screen.getByTestId("probe")).toHaveTextContent("system:light");
    expect(theme()).toBe("light");

    act(() => setSystemDark(true));

    expect(screen.getByTestId("probe")).toHaveTextContent("system:dark");
    expect(theme()).toBe("dark");
  });

  it("starts dark when the system is dark", () => {
    setSystemDark(true);

    renderTheme();

    expect(theme()).toBe("dark");
  });

  it("lets the toggle override the system and remembers the choice", async () => {
    renderTheme();

    await userEvent.click(screen.getByTitle("Dark"));

    expect(screen.getByTestId("probe")).toHaveTextContent("dark:dark");
    expect(theme()).toBe("dark");
    expect(localStorage.getItem("theme-preference")).toBe("dark");

    act(() => setSystemDark(true));
    await userEvent.click(screen.getByTitle("Light"));

    expect(theme()).toBe("light");
    expect(localStorage.getItem("theme-preference")).toBe("light");
  });

  it("forgets the choice when set back to follow the system", async () => {
    localStorage.setItem("theme-preference", "dark");
    renderTheme();
    expect(theme()).toBe("dark");

    await userEvent.click(screen.getByTitle("Follow system"));

    expect(localStorage.getItem("theme-preference")).toBeNull();
    expect(theme()).toBe("light");
  });

  it("uses the remembered choice at startup, whatever the system says", () => {
    localStorage.setItem("theme-preference", "light");
    setSystemDark(true);

    renderTheme();

    expect(screen.getByTestId("probe")).toHaveTextContent("light:light");
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("theme-preference", "purple");

    renderTheme();

    expect(screen.getByTestId("probe")).toHaveTextContent("system:light");
  });
});
