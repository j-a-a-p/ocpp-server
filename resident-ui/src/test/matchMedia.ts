// jsdom has no matchMedia. This fake lets a test switch the system between light and dark.
type Listener = (event: { matches: boolean }) => void;

// Width queries (the breakpoints of Ant Design) follow window.innerWidth, which is 1024 in jsdom: a laptop.
// Everything else, such as prefers-color-scheme, is false until a test changes it.
const evaluate = (query: string) => {
  const min = query.match(/min-width:\s*(\d+)px/);
  const max = query.match(/max-width:\s*(\d+)px/);
  return (!min || window.innerWidth >= Number(min[1])) && (!max || window.innerWidth <= Number(max[1])) && Boolean(min || max);
};

class FakeMediaQuery {
  matches: boolean;
  onchange = null;
  private listeners = new Set<Listener>();

  constructor(readonly media: string) {
    this.matches = evaluate(media);
  }

  addEventListener(_type: string, listener: Listener) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: Listener) {
    this.listeners.delete(listener);
  }
  addListener(listener: Listener) {
    this.listeners.add(listener);
  }
  removeListener(listener: Listener) {
    this.listeners.delete(listener);
  }
  dispatchEvent() {
    return true;
  }

  change(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach((listener) => listener({ matches }));
  }
}

const queries = new Map<string, FakeMediaQuery>();

const mediaQuery = (query: string) => {
  if (!queries.has(query)) {
    queries.set(query, new FakeMediaQuery(query));
  }
  return queries.get(query)!;
};

window.matchMedia = ((query: string) => mediaQuery(query)) as unknown as typeof window.matchMedia;

export const setSystemDark = (dark: boolean) => mediaQuery("(prefers-color-scheme: dark)").change(dark);
