import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, ConfigProvider, theme } from "antd";
import { ThemeContext, type ThemePreference } from "./themeContext";

const STORAGE_KEY = "theme-preference";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const readPreference = (): ThemePreference => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(darkQuery.matches);
  const isDark = preference === "dark" || (preference === "system" && systemDark);

  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    darkQuery.addEventListener("change", onChange);
    return () => darkQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  const value = useMemo(() => ({ preference, setPreference, isDark }), [preference, isDark]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: "#0d9488",
            colorInfo: "#0d9488",
            colorSuccess: "#16a34a",
            colorWarning: "#f59e0b",
            colorError: "#ef4444",
            colorBgLayout: isDark ? "#0b0d10" : "#f3f5f7",
            ...(isDark
              ? {}
              : {
                  colorPrimaryBg: "#e2f5f2",
                  colorPrimaryBgHover: "#c8ece6",
                  colorSuccessBg: "#e7f7ec",
                  colorWarningBg: "#fef4dc",
                  colorErrorBg: "#fdeaea",
                }),
            borderRadius: 10,
            fontFamily:
              "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          },
          components: {
            Card: { headerFontSize: 15 },
            Layout: { headerBg: "transparent", headerPadding: "0 24px" },
            Table: { headerBg: isDark ? "#1a1d21" : "#fafbfc" },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
