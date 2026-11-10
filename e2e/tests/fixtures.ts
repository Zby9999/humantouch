import { expect as baseExpect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { showLayersOnEntry } from "../layers-on-entry.ts";

/**
 * Playwright's, and `toReadAs`: the change list's rows read as `patterns`, in order, each row its name and then its
 * values, which it shows in its tip (designer, 2026-11-10). A string is a part of the row; a pattern, the whole of it.
 */
export const expect = baseExpect.extend({
  async toReadAs(rows: Locator, patterns: (RegExp | string)[], options?: { timeout?: number }) {
    const read = () =>
      rows.evaluateAll((els) => els.map((el) => `${el.textContent} ${el.querySelector(".tk-change-text")?.getAttribute("data-tk-tip") ?? ""}`.trim()));
    const expected = patterns.map((each) => (typeof each === "string" ? baseExpect.stringContaining(each) : baseExpect.stringMatching(each)));
    try {
      await baseExpect.poll(read, options).toEqual(expected);
      return { pass: true, name: "toReadAs", message: () => "the rows read as expected" };
    } catch (error) {
      return { pass: false, name: "toReadAs", message: () => (error as Error).message };
    }
  },
});
export type { CDPSession, Frame, Locator, Page } from "@playwright/test";

/**
 * Tests share one dev server, and so one `.03kind/` folder. Unless a test
 * opts out with `keepRoundInMemory: false`, the round it saves stays in its
 * own browser context, so tests running side by side never see each other's.
 *
 * The Layers panel starts hidden, on every entry (designer, 2026-11-08); most
 * tests work through it, so it is shown as edit mode is entered, each time,
 * unless a test opts out with `showLayers: false` (`showLayersOnEntry`).
 */
export const test = base.extend<{ keepRoundInMemory: boolean; showLayers: boolean; detachCodeVariables: boolean }>({
  keepRoundInMemory: [true, { option: true }],
  showLayers: [true, { option: true }],
  detachCodeVariables: [true, { option: true }],
  /**
   * A value the code writes with a Variable shows it by name in the Design
   * panel, in place of its field (ticket 119); detached, the field shows the
   * value, and nothing is changed. Tests not about Variables type into the
   * fields as they did before: whenever such a name shows, it is detached in
   * the frame after (`detachInCode`). Those about Variables opt out with `detachCodeVariables: false`.
   */
  page: async ({ page, detachCodeVariables }, use) => {
    if (detachCodeVariables) await page.addInitScript(detachInCode);
    await use(page);
  },
  context: async ({ context, keepRoundInMemory, showLayers }, use) => {
    await watchVariables(context);
    if (keepRoundInMemory) await keepRoundIn(context);
    if (showLayers) await showLayersOnEntry(context);
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
      let url: URL;
      try {
        url = new URL(input instanceof Request ? input.url : String(input), location.href);
      } catch {
        return fetch.call(window, input, init);
      }
      const response = fetch.call(window, input, init);
      if (url.hostname !== "127.0.0.1" || url.pathname !== "/variables") return response;
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
 * They come in after the canvas; until then the Design panel shows no
 * Variables buttons and typing offers no Variables. A field typed into as they
 * come in keeps what is typed (ticket 98). On a busy machine they took seconds
 * (ticket 93).
 *
 * The Shell asks for them as it mounts (`useState(loadVariables)`), when the
 * dev server set up the local service: the request is made before the canvas
 * is up, so by the time a view shows the page has counted it. Not every entry
 * asks: entered again while edit mode is still leaving, the Shell stays, its
 * Variables in already; then none is open, and this returns at once.
 */
async function variablesIn(page: Page) {
  // A read as the page navigates fails ("Execution context was destroyed"), and `expect.poll`
  // would fail with it at once: that read counts as still open, and the new document is read next.
  const open = () =>
    page
      .evaluate((name) => (window as unknown as Record<string, { open: number } | undefined>)[name]?.open ?? 0, VARIABLES_ASKED)
      .catch((error: unknown) => {
        if (error instanceof Error && /context was destroyed|navigat/i.test(error.message)) return 1;
        throw error;
      });
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

/**
 * A segmented group changed in this round (designer, 2026-11-08): the one chosen stays white, the track behind it takes the accent,
 * and its reset, 24px, stands inside the track at its right end, there in full once it has popped out.
 */
export async function expectSegmentedChanged(group: Locator, chosen: Locator, reset: Locator) {
  await expect(group).toHaveClass(/\bis-changed\b/);
  await expect(group).toHaveCSS("background-color", "rgb(0, 143, 240)");
  await expect(chosen).toHaveAttribute("aria-checked", "true");
  await expect(chosen).toHaveCSS("background-color", "rgb(250, 250, 250)");
  await expect(reset).toHaveCSS("opacity", "1");
  const [box, button] = await Promise.all([steadyBox(group), steadyBox(reset)]);
  expect(button.width).toBe(24);
  expect(button.x).toBeGreaterThanOrEqual(box.x);
  expect(Math.round(box.x + box.width - (button.x + button.width))).toBe(2);
}

/** In the page, each frame: detaches every Variable the Design panel shows as the code's (ticket 119), as a designer would to type a value. */
function detachInCode() {
  if (window.top !== window) return;
  const tick = () => {
    const root = document.querySelector("third-kind")?.shadowRoot;
    root?.querySelectorAll<HTMLElement>("[data-tk-in-code]").forEach((button) => button.click());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
