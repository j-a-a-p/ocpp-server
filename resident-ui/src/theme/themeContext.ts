import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useThemeMode = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within a ThemeProvider");
  }
  return context;
};
