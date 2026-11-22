import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, json } from "../test/mockFetch";
import { submitEmail } from "../services/authService";
import { isAuthenticated } from "./auth";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("isAuthenticated", () => {
  it("is true when the API accepts the cookie", async () => {
    mockFetch({ "GET /auth/validate": json({ resident_id: 1 }) });

    expect(await isAuthenticated()).toEqual({ isAuthenticated: true, serverAvailable: true });
  });

  it("is false but available on a 401", async () => {
    mockFetch({ "GET /auth/validate": json({ detail: "Missing auth token" }, 401) });

    expect(await isAuthenticated()).toEqual({ isAuthenticated: false, serverAvailable: true });
  });

  it("treats a 5xx as an unavailable server", async () => {
    mockFetch({ "GET /auth/validate": json({}, 503) });

    expect(await isAuthenticated()).toMatchObject({ isAuthenticated: false, serverAvailable: false });
  });

  it("treats a network error as an unavailable server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await isAuthenticated()).toMatchObject({ isAuthenticated: false, serverAvailable: false });
  });

  it("keeps the server available for other client errors", async () => {
    mockFetch({ "GET /auth/validate": json({}, 404) });

    expect(await isAuthenticated()).toMatchObject({ isAuthenticated: false, serverAvailable: true });
  });
});

describe("submitEmail", () => {
  it("asks for a resident login link for the email address", async () => {
    const fetchMock = mockFetch({ "POST /auth/request-access": json({ success: true, message: "Check your mail" }) });

    const result = await submitEmail("anna+test@example.com");

    expect(result).toEqual({ success: true, message: "Check your mail" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/request-access?email=anna%2Btest%40example.com&flow=resident");
  });

  it("reports a failure", async () => {
    mockFetch({ "POST /auth/request-access": json({ message: "Failed to send login email" }, 500) });

    expect(await submitEmail("anna@example.com")).toEqual({ success: false, message: "Failed to send login email" });
  });

  it("reports a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await submitEmail("anna@example.com");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/network error/i);
  });
});
