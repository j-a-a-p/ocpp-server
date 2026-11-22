import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { setSystemDark } from "./matchMedia";

// Ant Design measures elements with ResizeObserver, which jsdom does not have.
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", FakeResizeObserver);
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  setSystemDark(false);
});
