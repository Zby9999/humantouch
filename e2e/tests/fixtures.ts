import { expect as baseExpect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { showLayersOnEntry } from "../layers-on-entry.ts";
import { LAYERS_FOLD_MS, LAYERS_FOLD_RISE_PX } from "../../packages/humantouch/src/client/motion";

/**
 * Playwright's, and `toReadAs`: the change list's rows read as `patterns`, in order, each row its name and then its
 * values, which it shows in its tip (designer, 2026-11-10). A string is a part of the row; a pattern, the whole of it.
 */
export const expect = baseExpect.extend({
  async toReadAs(rows: Locator, patterns: (RegExp | string)[], options?: { timeout?: number }) {
    const read = () =>
      rows.evaluateAll((els) => els.map((el) => `${el.textContent} ${el.querySelector(".ht-change-text")?.getAttribute("data-ht-tip") ?? ""}`.trim()));
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
 * Tests share one dev server, and so one `.humantouch/` folder. Unless a test
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
  /** The page the round's canvas reflects, printed (ticket 141): answered with the round, dropped with it. */
  let printed: unknown = null;
  await context.route(
    (url) => url.hostname === "127.0.0.1" && ["/round", "/page", "/events", "/status", "/unlock", "/checks", "/off-canvas"].includes(url.pathname),
    (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin ?? "*",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, POST",
        "Access-Control-Allow-Headers": "X-Human-Touch-Token, Content-Type",
      };
      const { pathname } = new URL(request.url());
      if (pathname === "/off-canvas") {
        if (request.method() === "PUT") offCanvas = JSON.parse(request.postData()!).layers.length ? request.postData() : null;
        if (request.method() === "GET" && offCanvas) return route.fulfill({ status: 200, headers, contentType: "application/json", body: offCanvas });
        return route.fulfill({ status: 204, headers });
      }
      if (pathname === "/page") {
        printed = JSON.parse(request.postData()!);
        return route.fulfill({ status: 204, headers });
      }
      if (pathname === "/events") {
        return route.fulfill({ status: 200, headers, contentType: "application/x-ndjson", body: `${JSON.stringify({ status: "editing" })}\n` });
      }
      if (pathname === "/status") return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ status: "editing" }) });
      if (pathname === "/unlock" || pathname === "/checks") return route.fulfill({ status: 409, headers });
      if (request.method() === "GET" && saved) {
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: printed ? JSON.stringify({ ...JSON.parse(saved), page: printed }) : saved });
      }
      if (request.method() === "PUT") saved = request.postData();
      if (request.method() === "DELETE") [saved, printed] = [null, null];
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
 * `.ht-viewport.is-travelling` is never there, and the wait returns at once.
 * With motion on, the page shrinks into the canvas, and a press or a drag made
 * meanwhile lands on the page shrinking. The one test calling this with motion
 * on (views.spec.ts, the drag in the phone view) waits for the phone view
 * first, which is drawn only once the travel has ended; the wait is for a test
 * that turns motion on and waits for the desktop view, which travels.
 */
export async function canvasInPlace(page: Page) {
  await page.locator(".ht-viewport.is-travelling").waitFor({ state: "detached" });
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

/**
 * Holds every animation in the page where it is, those that start meanwhile too, until the call returned lets them
 * play on: a test reads a short motion (a fold's 200ms) midway however busy the machine, where read after its click
 * it could already be over (ticket 126). The DevTools protocol's playback rate, the one the Animations panel sets;
 * timers run on.
 */
export async function holdMotion(page: Page): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  return async () => {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await cdp.detach();
  };
}

/**
 * Where `el`'s animations put it `at` ms in, all of them sought there, read from its computed style: how far it is
 * moved down (px, up < 0) and how opaque it is. For motion held by `holdMotion`.
 */
export function seekTo(el: Locator, at: number) {
  return el.evaluate((node, at) => {
    for (const animation of node.getAnimations({ subtree: true })) animation.currentTime = at;
    const style = getComputedStyle(node);
    return { y: new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform).m42, opacity: Number(style.opacity) };
  }, at);
}

/**
 * A fold under way, held by `holdMotion` (designer, 2026-11-08; a level closed in the Layers, an effect folded in the
 * Design panel): the copies, `fold`, going up `LAYERS_FOLD_RISE_PX` and fading, shown only above what rises after
 * them, over `LAYERS_FOLD_MS`; `after`, the first of what rises, rising from where it was over the same time. Halfway,
 * `rows` (the copies' box that moves) part of the way up and faded part of the way, `after` still below its place.
 */
export async function expectFolding(fold: Locator, rows: Locator, after: Locator) {
  const animations = await fold.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((animation) => ({
      frames: (animation.effect as KeyframeEffect).getKeyframes().map((frame) => frame.transform ?? frame.clipPath),
      duration: animation.effect!.getTiming().duration,
    })),
  );
  expect(animations.map((a) => a.frames)).toEqual(expect.arrayContaining([["none", `translateY(-${LAYERS_FOLD_RISE_PX}px)`], ["inset(0px)", "inset(0px 0px 100%)"]]));
  expect(new Set(animations.map((a) => a.duration))).toEqual(new Set([LAYERS_FOLD_MS]));
  expect(await after.evaluate((el) => el.getAnimations().map((a) => a.effect!.getTiming().duration))).toEqual([LAYERS_FOLD_MS]);
  const halfway = await seekTo(rows, LAYERS_FOLD_MS / 2);
  expect(halfway.y).toBeLessThan(0);
  expect(halfway.y).toBeGreaterThan(-LAYERS_FOLD_RISE_PX);
  expect(halfway.opacity).toBeGreaterThan(0);
  expect(halfway.opacity).toBeLessThan(1);
  expect((await seekTo(after, LAYERS_FOLD_MS / 2)).y).toBeGreaterThan(0);
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
    const root = document.querySelector("human-touch")?.shadowRoot;
    root?.querySelectorAll<HTMLElement>("[data-ht-in-code]").forEach((button) => button.click());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
