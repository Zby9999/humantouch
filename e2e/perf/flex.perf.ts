import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "../tests/fixtures";
import { BIG_URL, HEADLESS, RUN } from "./playwright.config";
import { report, summarize, type Summary } from "./stats";

/**
 * docs/goals.md, Flex: on a page of about 5000 elements, with the desktop,
 * tablet and phone views all showing it, edit mode is up within 150ms, a
 * value changed shows in the next frame, and a drag keeps 60fps. Each test
 * repeats its measurement, prints the median, 95th percentile and worst, and
 * says whether the target is met. How each is measured is said at each test;
 * ticket 22's Comments has it in full.
 *
 * In the headless shell (`VK_PERF_HEADLESS=1`) the numbers are for comparing
 * before and after a change only: the targets are reported, never checked.
 */

/** The views shown, by their iframes' titles: the defaults, as the designer first sees them. */
const VIEWS = ["Canvas", "Tablet 768", "Phone 390"];
/** The large page's product cards: `PRODUCTS` in `BigPage.tsx`. */
const PRODUCTS = 96;
/** One frame at 60fps. */
const FRAME_MS = 1000 / 60;
const ENTER_TARGET_MS = 150;
/** Runs of entering edit mode, each from a page loaded afresh, after one to warm up. */
const ENTER_RUNS = 8;
/** Values stepped per kind of change. */
const VALUE_STEPS = 20;
/** Drags measured, and how long each lasts. */
const DRAGS = 3;
const DRAG_MS = 2500;
/** How often the pointer moves while dragging: faster than frames come, as a mouse reports. */
const POINTER_EVERY_MS = 8;

/**
 * The numbers of this run, kept for comparing runs: out of `test-results/`,
 * which Playwright clears as it starts. Not checked in. Each test adds its
 * own as it ends, so a target not met leaves the others' numbers in.
 */
const RESULTS = fileURLToPath(new URL("./results/", import.meta.url));
const RESULTS_FILE = `${RESULTS}${RUN}-${HEADLESS ? "headless" : "chrome"}.json`;
const mode = HEADLESS ? "headless shell (reference only, not the acceptance numbers)" : "windowed Google Chrome";

function keep(name: string, numbers: unknown) {
  mkdirSync(RESULTS, { recursive: true });
  const kept = existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(RESULTS_FILE, "utf8")) : { mode, run: RUN };
  writeFileSync(RESULTS_FILE, `${JSON.stringify({ ...kept, [name]: numbers }, null, 2)}\n`);
  console.log(`   Kept in ${RESULTS_FILE}`);
}

/** Checks a target in the windowed Chrome; in the headless shell, only reports it. */
function verdict(met: boolean, what: string) {
  if (!HEADLESS) expect(met, what).toBe(true);
}

function print(text: string) {
  console.log(HEADLESS ? `${text}\n   (headless shell: reference only, targets not checked)` : text);
}

function host(page: Page) {
  return page.locator("vernier-kit");
}

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

/** Waits for the page to be still: two frames, then a while with nothing to do. */
async function settle(page: Page, idle = 300) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve)))));
  await page.waitForTimeout(idle);
}

/** Loads the large page afresh; returns how many elements it has. */
async function openBigPage(page: Page) {
  await page.goto(BIG_URL);
  await expect(page.locator("[data-testid=product]")).toHaveCount(PRODUCTS);
  const elements = await page.evaluate(() => document.body.getElementsByTagName("*").length);
  expect(elements).toBeGreaterThanOrEqual(4800);
  expect(elements).toBeLessThanOrEqual(5200);
  // As the designer reaches for the toggle: the rest of the editor layer loads then (ticket 34).
  await page.getByRole("button", { name: TOGGLE_LABEL }).hover();
  await settle(page, 1000);
  return elements;
}

/**
 * Edit mode is up when every view shows the canvas and the Layers panel
 * lists it: checked at each frame from the click on, the time is taken once
 * the first frame that shows them all has been drawn. The 240ms the page
 * takes to shrink into its place on the canvas is a transition, not a wait,
 * and is not counted: it starts with the frame that first shows the desktop
 * view, whose time is taken too, as that frame begins; the views beside it
 * are hidden till the transition ends.
 */
/** `scheduler.postTask`, which Chrome has and TypeScript's DOM types do not yet. */
interface WithScheduler {
  scheduler: { postTask(task: () => void, options: { priority: "user-blocking" | "user-visible" | "background" }): Promise<void> };
}

interface Entered {
  click: number;
  /** The first frame with the desktop view on screen begins: the page starts shrinking into the canvas. Its drawing is not counted. */
  desktop: number;
  /** The first frame drawn with every view and the Layers panel up. */
  up: number;
}

function armEnter(views: string[]) {
  const w = window as unknown as { vkEnter: Promise<Entered> };
  w.vkEnter = new Promise((resolve) => {
    const shadow = () => document.querySelector("vernier-kit")?.shadowRoot ?? null;
    const shows = (root: ShadowRoot, title: string) => {
      const frame = root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
      return !!frame?.contentDocument?.querySelector("[data-testid=big-hero]");
    };
    const desktopUp = (root: ShadowRoot | null): root is ShadowRoot => {
      const stage = root?.querySelector<HTMLElement>(".vk-stage");
      const shell = root?.querySelector<HTMLElement>(".vk-viewport")?.parentElement;
      return !!root && stage?.style.visibility === "visible" && shell?.style.opacity !== "0" && shows(root, views[0]);
    };
    const allUp = (root: ShadowRoot) => !!root.querySelector('[role="tree"] [role="treeitem"]') && views.every((title) => shows(root, title));
    /**
     * Calls `then` with the time once the frame under way has been drawn: a
     * task posted in a frame's callbacks runs then, and at the highest
     * priority, before what the page has queued meanwhile.
     */
    const drawn = (then: (at: number) => void) =>
      (window as unknown as WithScheduler).scheduler.postTask(() => then(performance.now()), {
        priority: "user-blocking",
      });
    addEventListener(
      "click",
      (event) => {
        const click = event.timeStamp;
        let desktop = 0;
        const frame = () => {
          const root = shadow();
          if (!desktopUp(root)) return requestAnimationFrame(frame);
          // When its frame begins: a task posted then may wait behind what the editor layer has queued, the views beside it.
          desktop ||= performance.now();
          if (!allUp(root)) return requestAnimationFrame(frame);
          drawn((up) => resolve({ click, desktop, up }));
        };
        requestAnimationFrame(frame);
      },
      { capture: true, once: true },
    );
  });
}

async function enterAndMeasure(page: Page, label: string) {
  await page.evaluate(armEnter, VIEWS);
  await page.getByRole("button", { name: label }).click();
  const { click, desktop, up } = await page.evaluate(() => (window as unknown as { vkEnter: Promise<Entered> }).vkEnter);
  return { total: up - click, desktop: desktop - click };
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  for (const title of VIEWS) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator("[data-testid=big-hero]")).toBeVisible();
  await settle(page, 500);
}

/** The body of the `n`th product card (1-based), a vertical Stack: the same in every view, which copy the canvas node for node. */
const cardBody = (n: number) => `[data-testid=big-products] [data-testid=product]:nth-of-type(${n}) > div:nth-of-type(2)`;
const card = (n: number) => `[data-testid=big-products] [data-testid=product]:nth-of-type(${n})`;

/** Selects the deepest layer at a point in the body's padding, the body itself, in the desktop view; with `parent`, the card around it. */
async function selectCard(page: Page, n: number, { parent = false } = {}) {
  const body = (await canvas(page).locator(cardBody(n)).boundingBox())!;
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(body.x + 3, body.y + 3);
  await page.keyboard.up("ControlOrMeta");
  if (parent) await page.keyboard.press("Escape");
  await settle(page);
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

interface ValueSample {
  /** In the first frame drawn after the key was pressed, every view showed the new value. */
  firstFrame: boolean;
  /** Frames drawn till every view showed it. */
  frames: number;
  /** The main thread's time on it: handling the key, then drawing that frame. */
  work: number;
  /** From the key press to that frame drawn; with a screen, this includes waiting for its next refresh. */
  latency: number;
}

/**
 * A key that changes a value: the time from the key's arrival to the end of
 * its handling, plus the time the frame after it takes from its first
 * callback to being drawn, is the main thread's work for the change; it fits
 * in one frame when under 16.7ms. Whether every view shows the new value is
 * checked once each frame is drawn: in the first, it changed within a frame.
 */
function armValue({ views, selector, property, expected }: { views: string[]; selector: string; property: string; expected: string }) {
  const w = window as unknown as { vkValue: Promise<ValueSample> };
  const { scheduler } = window as unknown as WithScheduler;
  w.vkValue = new Promise((resolve) => {
    const root = document.querySelector("vernier-kit")!.shadowRoot!;
    const docs = views.map((title) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!);
    const shown = () => docs.every((doc) => getComputedStyle(doc.querySelector(selector)!).getPropertyValue(property) === expected);
    let start = 0;
    let arrived = 0;
    let handled = 0;
    const onCapture = (event: KeyboardEvent) => {
      start = performance.now();
      arrived = event.timeStamp;
      removeEventListener("keydown", onCapture, true);
      let frames = 0;
      let first = { at: 0, drawn: 0 };
      const frame = () => {
        frames++;
        const at = performance.now();
        // Once the frame has been drawn, before what the page has queued meanwhile (see `armEnter`).
        scheduler.postTask(() => {
          const drawn = performance.now();
          if (frames === 1) first = { at, drawn };
          if (!shown() && frames < 60) return requestAnimationFrame(frame);
          resolve({
            firstFrame: frames === 1 && shown(),
            frames,
            work: (handled || first.at) - start + (first.drawn - first.at),
            latency: first.drawn - arrived,
          });
        }, { priority: "user-blocking" });
      };
      requestAnimationFrame(frame);
    };
    // Last at the window: once the editor layer has handled the key.
    const onBubble = () => {
      handled = performance.now();
      removeEventListener("keydown", onBubble);
    };
    addEventListener("keydown", onCapture, true);
    addEventListener("keydown", onBubble);
  });
}

/** Steps a value up with the arrow key, `VALUE_STEPS` times, measuring each. */
async function stepValue(page: Page, field: string, selector: string, property: string) {
  const input = design(page).getByRole("textbox", { name: field, exact: true });
  await input.focus();
  const samples: ValueSample[] = [];
  for (let i = 0; i < VALUE_STEPS; i++) {
    const before = await canvas(page).locator(selector).evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
    const expected = `${parseFloat(before) + 1}px`;
    await page.evaluate(armValue, { views: VIEWS, selector, property, expected });
    await page.keyboard.press("ArrowUp");
    samples.push(await page.evaluate(() => (window as unknown as { vkValue: Promise<ValueSample> }).vkValue));
    await settle(page, 150);
  }
  return samples;
}

/**
 * The frames drawn while dragging: the time of each, from
 * `requestAnimationFrame`, and so the time between them; frames that never
 * came show as longer gaps. Also the long tasks (over 50ms) meanwhile, the
 * frames in which the drag showed where the layer would go, and how many
 * pointer moves reached the page: as many as frames, or each frame had a
 * move of the drag to show.
 */
interface FrameRecord {
  times: number[];
  withLine: number;
  long: number[];
  moves: number;
  stop(): void;
}

function armFrames() {
  const w = window as unknown as { vkFrames: FrameRecord };
  const root = document.querySelector("vernier-kit")!.shadowRoot!;
  const record: FrameRecord = { times: [], withLine: 0, long: [], moves: 0, stop() {} };
  const moved = () => record.moves++;
  addEventListener("pointermove", moved, true);
  let on = true;
  const loop = (time: number) => {
    record.times.push(time);
    if (root.querySelector(".vk-drop-line")) record.withLine++;
    if (on) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const observer = new PerformanceObserver((list) => record.long.push(...list.getEntries().map((entry) => entry.duration)));
  observer.observe({ type: "longtask" });
  record.stop = () => {
    on = false;
    observer.disconnect();
    removeEventListener("pointermove", moved, true);
  };
  w.vkFrames = record;
}

/** Drags card `n`, selected, back and forth over the cards beside it and the row below, for `DRAG_MS`; then lets it go back where it was. */
async function dragCard(page: Page, n: number) {
  const box = (await canvas(page).locator(card(n)).boundingBox())!;
  const step = (await canvas(page).locator(card(n + 1)).boundingBox())!.x - box.x;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  await page.mouse.move(from.x, from.y);
  await page.evaluate(armFrames);
  await page.mouse.down();
  // Sent straight to the browser every few ms, each without waiting for the last to be taken: as a mouse reports,
  // whether or not the page keeps up. (Playwright's own moves each wait for the page, so a busy page would get fewer.)
  const cdp = await page.context().newCDPSession(page);
  const sent: Promise<unknown>[] = [];
  const started = Date.now();
  await new Promise<void>((done) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed >= DRAG_MS) {
        clearInterval(timer);
        return done();
      }
      // Across two cards and back, and down a row and back, once every 1.25s.
      const phase = (elapsed / 1250) * 2 * Math.PI;
      const [x, y] = [from.x + Math.sin(phase) * step * 2, from.y + (1 - Math.cos(phase)) * box.height * 0.6];
      sent.push(cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 }));
    }, POINTER_EVERY_MS);
  });
  await Promise.all(sent);
  await cdp.detach();
  const record = await page.evaluate(() => {
    const record = (window as unknown as { vkFrames: FrameRecord }).vkFrames;
    record.stop();
    return { times: record.times, withLine: record.withLine, long: record.long, moves: record.moves };
  });
  // Esc puts the card back as it was: the next drag starts from the same page.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await settle(page);
  return record;
}

test("entering edit mode, all three views up, takes at most 150ms", async ({ page }) => {
  const first: number[] = [];
  const again: number[] = [];
  const desktop: number[] = [];
  let elements = 0;
  for (let run = 0; run <= ENTER_RUNS; run++) {
    elements = await openBigPage(page);
    const entry = await enterAndMeasure(page, TOGGLE_LABEL);
    await settle(page, 600);
    // Back to preview mode, and in again: the page is frozen afresh.
    await page.getByRole("button", { name: EXIT_LABEL }).click();
    await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
    await settle(page, 600);
    const reentry = await enterAndMeasure(page, TOGGLE_LABEL);
    if (run === 0) continue; // Warming up: the dev server's first answers, the browser's first compiles.
    first.push(entry.total);
    again.push(reentry.total);
    desktop.push(entry.desktop, reentry.desktop);
  }
  const all = summarize([...first, ...again]);
  const firstSummary = summarize(first);
  const againSummary = summarize(again);
  keep("page", { url: BIG_URL, elements, views: VIEWS });
  keep("enter", { first: firstSummary, again: againSummary, all, desktopViewUp: summarize(desktop), samples: { first, again } });
  print(
    report(
      `Entering edit mode, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "first entry after load", summary: firstSummary },
        { name: "entering again", summary: againSummary },
        { name: "all entries", summary: all, target: `median ≤ ${ENTER_TARGET_MS}ms`, met: all.median <= ENTER_TARGET_MS },
        { name: "(desktop view's first frame begins)", summary: summarize(desktop) },
      ],
      ["From the click to the first frame drawn with every view and the Layers panel up."],
    ),
  );
  verdict(all.median <= ENTER_TARGET_MS, `entering edit mode: median ${all.median.toFixed(1)}ms, target ${ENTER_TARGET_MS}ms`);
});

test("a value changed shows in every view in the next frame", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  // Paint only: a card's corner radius.
  await selectCard(page, 6, { parent: true });
  const radius = await stepValue(page, "Corner radius", card(6), "border-top-left-radius");
  // Layout: the gap of a card's Stack, which makes the card, its row and everything below it move, in every view.
  await selectCard(page, 6);
  const gap = await stepValue(page, "Gap", cardBody(6), "row-gap");

  const rows = [];
  const kinds: [string, ValueSample[]][] = [
    ["corner radius (paint)", radius],
    ["Stack gap (layout)", gap],
  ];
  const summaries: Record<string, { work: Summary; latency: Summary; inFirstFrame: number; frames: number[] }> = {};
  let met = true;
  for (const [name, samples] of kinds) {
    const work = summarize(samples.map((s) => s.work));
    const latency = summarize(samples.map((s) => s.latency));
    const inFirstFrame = samples.filter((s) => s.firstFrame).length;
    // Every step in the first frame, and 19 in 20 within it: the odd one may meet a garbage collection.
    const ok = inFirstFrame === samples.length && work.p95 <= FRAME_MS;
    met &&= ok;
    summaries[name] = { work, latency, inFirstFrame, frames: samples.map((s) => s.frames) };
    rows.push(
      { name: `${name}: work`, summary: work, target: `p95 ≤ ${FRAME_MS.toFixed(1)}ms, in the first frame`, met: ok },
      { name: `${name}: key to frame drawn`, summary: latency },
    );
  }
  keep("value", summaries);
  print(
    report(
      `Changing a value, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      rows,
      kinds.map(([name, samples]) => `${name}: ${samples.filter((s) => s.firstFrame).length} of ${samples.length} steps shown in every view in the first frame`),
    ),
  );
  verdict(met, "a value changed shows in every view in the next frame");
});

test("dragging a layer keeps 60fps", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await selectCard(page, 6, { parent: true });
  const intervals: number[] = [];
  const fps: number[] = [];
  const long: number[] = [];
  /** Pointer moves that reached the page, per second of each drag; Chrome hands the page at most one a frame. */
  const moves: number[] = [];
  for (let i = 0; i < DRAGS; i++) {
    const record = await dragCard(page, 6);
    expect(record.withLine, "the drag shows where the card would go").toBeGreaterThan(0);
    const gaps = record.times.slice(1).map((time, j) => time - record.times[j]);
    intervals.push(...gaps);
    fps.push(((record.times.length - 1) / (record.times.at(-1)! - record.times[0])) * 1000);
    long.push(...record.long);
    moves.push((record.moves / (record.times.at(-1)! - record.times[0])) * 1000);
  }
  const frameSummary = summarize(intervals);
  const fpsSummary = summarize(fps, { higherIsBetter: true });
  const dropped = intervals.filter((gap) => gap > FRAME_MS * 1.5).length;
  // 60fps kept: as many frames as that, give or take the odd one, and 19 in 20 frames on time.
  const met = fpsSummary.worst >= 58 && frameSummary.p95 <= FRAME_MS * 1.25;
  const movesSummary = summarize(moves, { higherIsBetter: true });
  keep("drag", { fps: fpsSummary, frameIntervals: frameSummary, dropped, frames: intervals.length, longTasks: long, pointerMovesPerSecond: movesSummary });
  print(
    report(
      `Dragging a card, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "frames per second, per drag", summary: fpsSummary, unit: (v) => v.toFixed(1), target: "every drag ≥ 58", met: fpsSummary.worst >= 58 },
        { name: "pointer moves per second, per drag", summary: movesSummary, unit: (v) => v.toFixed(0) },
        { name: "time between frames", summary: frameSummary, target: `p95 ≤ ${(FRAME_MS * 1.25).toFixed(1)}ms`, met: frameSummary.p95 <= FRAME_MS * 1.25 },
      ],
      [`${dropped} of ${intervals.length} frames late (more than 1.5 frames apart); ${long.length} long tasks${long.length ? `, the longest ${Math.max(...long).toFixed(0)}ms` : ""}.`],
    ),
  );
  verdict(met, "dragging keeps 60fps");
});
