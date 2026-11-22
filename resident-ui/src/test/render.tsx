import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";

/** Renders inside what main.tsx provides: the theme (with the Ant Design App) and a router. */
export const renderWithProviders = (ui: ReactElement, { route = "/" }: { route?: string } = {}) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ThemeProvider>
  );
