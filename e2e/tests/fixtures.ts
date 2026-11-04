import { expect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";

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
    await watchVariables(context);
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
 * Waits, once edit mode has been entered and a view shows, for the canvas to
 * take presses: what really waits is `variablesIn`, the project's Variables in
 * and drawn with (ticket 93).
 *
 * Also waits for the canvas to travel into place, which matters only with
 * motion on. The tests run with reduced motion (`reducedMotion` in the
 * config), and then the mode switch only fades the shell in: nothing travels,
 * `.tk-viewport.is-travelling` is never there, and the wait returns at once.
 * With motion on, the page shrinks into the canvas, and a press or a drag made
 * meanwhile lands on the page shrinking. The one test calling this with motion
 * on (views.spec.ts, the drag in the phone view) waits for the phone view
 * first, which is drawn only once the travel has ended; the wait is for a test
 * that turns motion on and waits for the desktop view, which travels.
 */
export async function canvasInPlace(page: Page) {
  await page.locator(".tk-viewport.is-travelling").waitFor({ state: "detached" });
  await variablesIn(page);
}

/** Where the page counts its requests for the project's Variables (`watchVariables`). */
const VARIABLES_ASKED = "__e2eVariablesAsked";

/**
 * Has the page count its requests for the project's Variables not yet read
 * through, in the page itself: a count read there has every request
 * the page made so far, where Playwright's request events can still be on
 * their way to the test. Each new document starts at none.
 */
async function watchVariables(context: BrowserContext) {
  await context.addInitScript((name) => {
    if (window !== window.top) return;
    const asked = { open: 0 };
    (window as unknown as Record<string, typeof asked>)[name] = asked;
    const fetch = window.fetch;
    window.fetch = (input, init) => {
      const response = fetch.call(window, input, init);
      const { hostname, pathname } = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (hostname !== "127.0.0.1" || pathname !== "/variables") return response;
      asked.open++;
      // Answered once the whole body is in, as the editor layer reads it.
      void response
        .then((answer) => answer.clone().text())
        .catch(() => {})
        .finally(() => asked.open--);
      return response;
    };
  }, VARIABLES_ASKED);
}

/**
 * Waits for the project's Variables to be in, once edit mode has been entered.
 * They come in after the canvas; the Design panel's fields are then drawn
 * anew, each beside its Variables button, and a field filled or clicked before
 * that loses it: an Enter pressed next applies nothing. On a busy machine they
 * took seconds (ticket 93).
 *
 * The Shell asks for them as it mounts (`useState(loadVariables)`), when the
 * dev server set up the local service: the request is made before the canvas
 * is up, so by the time a view shows the page has counted it. Not every entry
 * asks: entered again while edit mode is still leaving, the Shell stays, its
 * Variables in already; then none is open, and this returns at once.
 */
async function variablesIn(page: Page) {
  const open = () => page.evaluate((name) => (window as unknown as Record<string, { open: number } | undefined>)[name]?.open ?? 0, VARIABLES_ASKED);
  await expect.poll(open, { message: "the project's Variables are in" }).toBe(0);
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
