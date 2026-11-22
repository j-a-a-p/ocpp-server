import { vi } from "vitest";

type Handler = Response | ((url: string, init?: RequestInit) => Response | Promise<Response>);

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * Replaces fetch. Routes look like "GET /cards/my_cards": the method and a part of the URL.
 * The first matching route answers, anything else is a 404 so a forgotten route shows up in a test.
 */
export const mockFetch = (routes: Record<string, Handler>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    for (const [route, handler] of Object.entries(routes)) {
      const [routeMethod, path] = route.split(" ");
      if (routeMethod === method && url.includes(path)) {
        return typeof handler === "function" ? handler(url, init) : handler.clone();
      }
    }
    return new Response("Not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** The calls made so far as "METHOD url". */
export const requests = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.map(([input, init]) => `${(init?.method ?? "GET").toUpperCase()} ${String(input)}`);
