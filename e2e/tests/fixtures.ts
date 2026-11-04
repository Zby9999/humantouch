import { expect, test as base, type BrowserContext, type Locator, type Page, type Request } from "@playwright/test";

export { expect } from "@playwright/test";
export type { CDPSession, Frame, Locator, Page } from "@playwright/test";

/**
 * Tests share one dev server, and so one `.03kind/` folder. Unless a test
 * opts out with `keepRoundInMemory: false`, the round it saves stays in its
 * own browser context, so tests running side by side never see each other's.
 *
 * The Layers panel starts hidden; most tests work through it, so it is shown
 * unless a test opts out with `showLayers: false`.
 */
export const test = base.extend<{ keepRoundInMemory: boolean; showLayers: boolean }>({
  keepRoundInMemory: [true, { option: true }],
  showLayers: [true, { option: true }],
  context: async ({ context, keepRoundInMemory, showLayers }, use) => {
    watchVariables(context);
    if (keepRoundInMemory) await keepRoundIn(context);
    if (showLayers) await context.addInitScript(() => localStorage.setItem("03kind:layers-panel", "shown"));
    await use(context);
  },
});

/** Stands in for the local service, in memory: a round that is only ever edited, never claimed, and the layers off the canvas. */
export async function keepRoundIn(context: BrowserContext) {
  let saved: string | null = null;
  /** The layers off the canvas, which belong to no round. */
  let offCanvas: string | null = null;
  await context.route(
    (url) => url.hostname === "127.0.0.1" && ["/round", "/events", "/status", "/unlock", "/checks", "/off-canvas"].includes(url.pathname),
    (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin ?? "*",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, POST",
        "Access-Control-Allow-Headers": "X-03Kind-Token, Content-Type",
      };
      const { pathname } = new URL(request.url());
      if (pathname === "/off-canvas") {
        if (request.method() === "PUT") offCanvas = JSON.parse(request.postData()!).layers.length ? request.postData() : null;
        if (request.method() === "GET" && offCanvas) return route.fulfill({ status: 200, headers, contentType: "application/json", body: offCanvas });
        return route.fulfill({ status: 204, headers });
      }
      if (pathname === "/events") {
        return route.fulfill({ status: 200, headers, contentType: "application/x-ndjson", body: `${JSON.stringify({ status: "editing" })}\n` });
      }
      if (pathname === "/status") return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ status: "editing" }) });
      if (pathname === "/unlock" || pathname === "/checks") return route.fulfill({ status: 409, headers });
      if (request.method() === "GET" && saved) {
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: saved });
      }
      if (request.method() === "PUT") saved = request.postData();
      if (request.method() === "DELETE") saved = null;
      return route.fulfill({ status: 204, headers });
    },
  );
}

/**
 * Waits for the canvas to be in place. Entering edit mode, the page shrinks
 * into the canvas first; a view's layers are on the page before that ends, but
 * a press or a drag made meanwhile lands on the page shrinking, not on them.
 * Quick on an idle machine, it can take seconds on a busy one (ticket 93).
 */
export async function canvasInPlace(page: Page) {
  await page.locator(".tk-viewport.is-travelling").waitFor({ state: "detached" });
  await variablesIn(page);
}

/** Per page, the requests for the project's Variables made, and those not yet answered. */
const variablesAsked = new WeakMap<Page, { made: number; open: number }>();

const asksForVariables = (url: string) => {
  const { hostname, pathname } = new URL(url);
  return hostname === "127.0.0.1" && pathname === "/variables";
};

function watchVariables(context: BrowserContext) {
  const count = (url: string, page: Page | null, made: number, open: number) => {
    if (!page || !asksForVariables(url)) return;
    const seen = variablesAsked.get(page) ?? { made: 0, open: 0 };
    variablesAsked.set(page, { made: seen.made + made, open: seen.open + open });
  };
  const pageOf = (request: Request) => {
    try {
      return request.frame().page();
    } catch {
      return null;
    }
  };
  context.on("request", (request) => count(request.url(), pageOf(request), 1, 1));
  context.on("requestfinished", (request) => count(request.url(), pageOf(request), 0, -1));
  context.on("requestfailed", (request) => count(request.url(), pageOf(request), 0, -1));
}

/**
 * Waits for the project's Variables to be in, once edit mode has asked for
 * them. They come in after the canvas; the Design panel's fields are then
 * drawn anew, each beside its Variables button, and a field filled or clicked
 * before that loses it: an Enter pressed next applies nothing. On a busy
 * machine they took seconds (ticket 93).
 */
async function variablesIn(page: Page) {
  const seen = () => variablesAsked.get(page) ?? { made: 0, open: 0 };
  if (!seen().made) return;
  await expect.poll(() => seen().open, { message: "the project's Variables are in" }).toBe(0);
  // Then drawn with them.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

/**
 * Where `locator` is on the screen, once it has stopped moving: the same on
 * two reads 50 ms apart. For a press at a point: read once, as a panel or a
 * view is still being laid out, the point can be off it on a busy machine (ticket 93).
 */
export async function steadyBox(locator: Locator): Promise<Box> {
  let box: Box | null = null;
  let last = "";
  await expect
    .poll(
      async () => {
        box = await locator.boundingBox();
        const now = JSON.stringify(box);
        const same = box !== null && now === last;
        last = now;
        return same;
      },
      { message: "stays where it is", intervals: [50] },
    )
    .toBe(true);
  return box!;
}
