import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "../tests/fixtures";
import { BIG_URL, HEADLESS, RUN } from "./playwright.config";
import { ms, report, summarize, type Summary } from "./stats";

/**
 * docs/goals.md, Flex: on a page of about 5000 elements, with the desktop,
 * tablet and phone views all showing it, edit mode is up within 150ms, a
 * value changed shows within two frames, and a drag keeps 60fps. The value
 * shows in the next frame in the view worked in, the main thread's work for
 * it within two frames; the views beside it catch up once the steps pause, as
 * the designer chose in ticket 22 (ADR 0011). Each test
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
/** A value changed shows within two frames: the designer's target since 2026-10-30, one frame before (ticket 22). */
const VALUE_TARGET_MS = FRAME_MS * 2;
/** Runs of entering edit mode, each from a page loaded afresh, after one to warm up. */
const ENTER_RUNS = 8;
/** Values stepped per kind of change. */
const VALUE_STEPS = 20;
/**
 * An arrow key held down, as macOS repeats it by default (the designer's Mac
 * leaves it so: `HIDInitialKeyRepeat` 500ms, `HIDKeyRepeat` 83.3ms, as `ioreg`
 * reports): the first step, the first repeat half a second later, then one
 * every 83.3ms, 12 a second, sooner than the views beside pause for.
 */
const HELD_STEPS = 24;
const REPEAT_DELAY_MS = 500;
const REPEAT_EVERY_MS = 1000 / 12;
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

/** `scheduler.postTask`, which Chrome has and TypeScript's DOM types do not yet. */
interface WithScheduler {
  scheduler: { postTask(task: () => void, options: { priority: "user-blocking" | "user-visible" | "background" }): Promise<void> };
}

interface Entered {
  click: number;
  /** The first frame with the desktop view on screen begins: the page starts shrinking into the canvas. */
  desktop: number;
  /** That frame has been drawn: edit mode is up. */
  desktopDrawn: number;
  /** The first frame drawn with every view's copy laid out and the Layers panel up; the views beside the desktop view may still be hidden. */
  allUp: number;
  /** In the first frame once the page has shrunk into the canvas, every view showed it and the Layers panel listed it. */
  allUpAtEnd: boolean;
}

/**
 * Edit mode is up with the frame that first shows the desktop view, as the
 * page starts shrinking into its place on the canvas: the time is taken once
 * that frame has been drawn. The 240ms that takes is a transition, not a
 * wait, and is not counted; the views beside the desktop view are hidden
 * till it ends, and are made meanwhile. When it ends, every view shows the
 * canvas and the Layers panel lists it: checked in the first frame after it.
 * The time to the first frame drawn with every view's copy laid out and the
 * Layers panel up is taken too, for reference (the views beside the desktop
 * view still hidden), as is the time the desktop view's frame begins.
 */
function armEnter(views: string[]) {
  const w = window as unknown as { vkEnter: Promise<Entered> };
  w.vkEnter = new Promise((resolve) => {
    const shadow = () => document.querySelector("vernier-kit")?.shadowRoot ?? null;
    const frameOf = (root: ShadowRoot, title: string) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
    const shows = (root: ShadowRoot, title: string) => !!frameOf(root, title)?.contentDocument?.querySelector("[data-testid=big-hero]");
    const desktopUp = (root: ShadowRoot | null): root is ShadowRoot => {
      const stage = root?.querySelector<HTMLElement>(".vk-stage");
      const shell = root?.querySelector<HTMLElement>(".vk-viewport")?.parentElement;
      return !!root && stage?.style.visibility === "visible" && shell?.style.opacity !== "0" && shows(root, views[0]);
    };
    const allUp = (root: ShadowRoot) => !!root.querySelector('[role="tree"] [role="treeitem"]') && views.every((title) => shows(root, title));
    const travelling = (root: ShadowRoot) => !!root.querySelector(".vk-viewport.is-travelling");
    /** Shown on screen: in a view not hidden while the canvas travels. */
    const allShown = (root: ShadowRoot) => allUp(root) && views.every((title) => getComputedStyle(frameOf(root, title)!).visibility === "visible");
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
        const entered: Partial<Entered> = { click: event.timeStamp };
        const done = () => {
          if (entered.desktopDrawn !== undefined && entered.allUp !== undefined && entered.allUpAtEnd !== undefined) resolve(entered as Entered);
        };
        let wasTravelling = false;
        let upSeen = false;
        const frame = () => {
          const root = shadow();
          if (!desktopUp(root)) return requestAnimationFrame(frame);
          if (entered.desktop === undefined) {
            entered.desktop = performance.now();
            drawn((at) => {
              entered.desktopDrawn = at;
              done();
            });
          }
          if (!upSeen && allUp(root)) {
            upSeen = true;
            drawn((at) => {
              entered.allUp = at;
              done();
            });
          }
          wasTravelling ||= travelling(root);
          if (entered.allUpAtEnd === undefined && wasTravelling && !travelling(root)) entered.allUpAtEnd = allShown(root);
          if (!upSeen || entered.allUpAtEnd === undefined) requestAnimationFrame(frame);
          done();
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
  const { click, desktop, desktopDrawn, allUp, allUpAtEnd } = await page.evaluate(() => (window as unknown as { vkEnter: Promise<Entered> }).vkEnter);
  expect(allUpAtEnd, "once the page has shrunk into the canvas, every view shows it and the Layers panel lists it").toBe(true);
  return { desktopUp: desktopDrawn - click, desktopBegins: desktop - click, allUp: allUp - click };
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
  /** In the first frame drawn after the key was pressed, the view worked in showed the new value. */
  firstFrame: boolean;
  /** Frames drawn till every view showed it: the views beside the one worked in catch up once the steps pause. */
  frames: number;
  /** The main thread's time on it: handling the key, then drawing that frame. */
  work: number;
  /** From the key press to that frame drawn; with a screen, this includes waiting for its next refresh. */
  latency: number;
  /** From the key press to the first frame drawn with every view showing it. */
  everyView: number;
}

/**
 * A key that changes a value, in the view worked in, `views[0]`: the time
 * from the key's arrival to the end of its handling, plus the time the frame
 * after it takes from its first callback to being drawn, is the main thread's
 * work for the change; the target is two frames, 33.3ms. Whether the
 * view worked in shows the new value is checked once that frame is drawn: if
 * so, it showed in the next frame. The views beside it catch up once the
 * steps pause, as the designer chose (ticket 22, ADR 0011): how long till
 * every view shows it is kept as a reference.
 */
function armValue({ views, selector, property, expected }: { views: string[]; selector: string; property: string; expected: string }) {
  const w = window as unknown as { vkValue: Promise<ValueSample> };
  const { scheduler } = window as unknown as WithScheduler;
  w.vkValue = new Promise((resolve) => {
    const root = document.querySelector("vernier-kit")!.shadowRoot!;
    const docs = views.map((title) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!);
    const showsIn = (doc: Document) => getComputedStyle(doc.querySelector(selector)!).getPropertyValue(property) === expected;
    const shown = () => docs.every(showsIn);
    let start = 0;
    let arrived = 0;
    let handled = 0;
    const onCapture = (event: KeyboardEvent) => {
      start = performance.now();
      arrived = event.timeStamp;
      removeEventListener("keydown", onCapture, true);
      let frames = 0;
      let first = { at: 0, drawn: 0, worked: false };
      const frame = () => {
        frames++;
        const at = performance.now();
        // Once the frame has been drawn, before what the page has queued meanwhile (see `armEnter`).
        scheduler.postTask(() => {
          const drawn = performance.now();
          if (frames === 1) first = { at, drawn, worked: showsIn(docs[0]) };
          if (!shown() && frames < 60) return requestAnimationFrame(frame);
          resolve({
            firstFrame: first.worked,
            frames: shown() ? frames : Infinity,
            work: (handled || first.at) - start + (first.drawn - first.at),
            latency: first.drawn - arrived,
            everyView: drawn - arrived,
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

/** The computed `property` of what `selector` finds on the canvas, in the desktop view. */
function valueOnCanvas(page: Page, selector: string, property: string) {
  return canvas(page).locator(selector).evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
}

/** Waits till every view shows `value` for `property` of what `selector` finds. */
async function everyViewShows(page: Page, selector: string, property: string, value: string) {
  for (const title of VIEWS) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator(selector)).toHaveCSS(property, value);
}

/** Steps a value up with the arrow key, `VALUE_STEPS` times, measuring each. */
async function stepValue(page: Page, field: string, selector: string, property: string) {
  await design(page).getByRole("textbox", { name: field, exact: true }).focus();
  const samples: ValueSample[] = [];
  for (let i = 0; i < VALUE_STEPS; i++) {
    const expected = `${parseFloat(await valueOnCanvas(page, selector, property)) + 1}px`;
    await page.evaluate(armValue, { views: VIEWS, selector, property, expected });
    await page.keyboard.press("ArrowUp");
    samples.push(await page.evaluate(() => (window as unknown as { vkValue: Promise<ValueSample> }).vkValue));
    await settle(page, 150);
  }
  // After the last step, every view shows the last value.
  await everyViewShows(page, selector, property, await valueOnCanvas(page, selector, property));
  return samples;
}

interface HeldStep {
  /** In the first frame drawn after the key, the view worked in showed this step, or a later one (none came in the same frame at 83ms apart). */
  firstFrame: boolean;
  /** The value the views beside showed in that frame, the lowest of them. */
  beside: number;
  /** The main thread's time on it, as `ValueSample.work`. */
  work: number;
  /** From the key's arrival to that frame drawn. */
  latency: number;
}

interface Held {
  steps: HeldStep[];
  /** From the last key's arrival to the first frame drawn with every view showing the last value. */
  caughtUp: number;
}

/** What `armHeld` keeps in the page while the key is held, and once it is let go, the views catching up. */
interface HeldRecord {
  steps: HeldStep[];
  done: Promise<Held>;
}

/**
 * Each ArrowUp from now on, as `armValue` measures one: the time to handle
 * it and draw the frame after it, whether the view worked in, `views[0]`,
 * showed the step then, and what the views beside showed. Once the key is
 * let go, each frame drawn is looked at till every view shows the last step:
 * that frame's time, from the last key's arrival, is how long they took to
 * catch up.
 */
function armHeld({ views, selector, property, from }: { views: string[]; selector: string; property: string; from: number }) {
  const { scheduler } = window as unknown as WithScheduler;
  const root = document.querySelector("vernier-kit")!.shadowRoot!;
  const docs = views.map((title) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!);
  const valueIn = (doc: Document) => parseFloat(getComputedStyle(doc.querySelector(selector)!).getPropertyValue(property));
  /** Once a frame has been drawn, before what the page has queued meanwhile (see `armEnter`). */
  const afterFrame = (then: (at: number, drawn: number) => void) =>
    requestAnimationFrame(() => {
      const at = performance.now();
      scheduler.postTask(() => then(at, performance.now()), { priority: "user-blocking" });
    });
  const listening = new AbortController();
  const steps: HeldStep[] = [];
  let last = 0;
  let handling: { handled: number } | null = null;
  let letGo: (held: Held) => void;
  const record: HeldRecord = { steps, done: new Promise((resolve) => (letGo = resolve)) };
  addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "ArrowUp") return;
      const start = performance.now();
      const arrived = (last = event.timeStamp);
      const step: HeldStep = { firstFrame: false, beside: NaN, work: NaN, latency: NaN };
      const expected = from + steps.length + 1;
      steps.push(step);
      const timing = (handling = { handled: 0 });
      afterFrame((at, drawn) => {
        step.firstFrame = valueIn(docs[0]) >= expected;
        step.beside = Math.min(...docs.slice(1).map(valueIn));
        step.work = (timing.handled || at) - start + (drawn - at);
        step.latency = drawn - arrived;
      });
    },
    { capture: true, signal: listening.signal },
  );
  // Last at the window: once the editor layer has handled the key.
  addEventListener(
    "keydown",
    (event) => {
      if (event.key === "ArrowUp" && handling) handling.handled ||= performance.now();
    },
    { signal: listening.signal },
  );
  addEventListener(
    "keyup",
    (event) => {
      if (event.key !== "ArrowUp") return;
      listening.abort();
      const end = from + steps.length;
      const until = performance.now() + 2000;
      const look = () =>
        afterFrame((_, drawn) => {
          if (docs.every((doc) => valueIn(doc) === end)) letGo({ steps, caughtUp: drawn - last });
          else if (drawn > until) letGo({ steps, caughtUp: Infinity });
          else look();
        });
      look();
    },
    { capture: true, signal: listening.signal },
  );
  (window as unknown as { vkHeld: HeldRecord }).vkHeld = record;
}

/**
 * Holds the arrow key down on a value for `HELD_STEPS` steps, as macOS
 * repeats it: each key sent straight to the browser at its time, without
 * waiting for the page to take the last, as the keyboard does. Once it is let
 * go, waits till every view shows the last value.
 */
async function holdValue(page: Page, field: string, selector: string, property: string): Promise<Held> {
  await design(page).getByRole("textbox", { name: field, exact: true }).focus();
  const from = parseFloat(await valueOnCanvas(page, selector, property));
  await page.evaluate(armHeld, { views: VIEWS, selector, property, from });
  const cdp = await page.context().newCDPSession(page);
  const key = { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 };
  const sent: Promise<unknown>[] = [];
  const started = performance.now();
  for (let i = 0; i < HELD_STEPS; i++) {
    const at = i === 0 ? 0 : REPEAT_DELAY_MS + (i - 1) * REPEAT_EVERY_MS;
    const wait = started + at - performance.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    sent.push(cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", autoRepeat: i > 0, ...key }));
  }
  await new Promise((done) => setTimeout(done, REPEAT_EVERY_MS / 2));
  sent.push(cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key }));
  await Promise.all(sent);
  await cdp.detach();
  const held = await page.evaluate(() => (window as unknown as { vkHeld: HeldRecord }).vkHeld.done);
  await settle(page);
  await everyViewShows(page, selector, property, `${from + HELD_STEPS}px`);
  return held;
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

test("entering edit mode, the desktop view up, takes at most 150ms; once the page is in place, all three views are up", async ({ page }) => {
  const first: number[] = [];
  const again: number[] = [];
  const desktopBegins: number[] = [];
  const allUp: number[] = [];
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
    first.push(entry.desktopUp);
    again.push(reentry.desktopUp);
    desktopBegins.push(entry.desktopBegins, reentry.desktopBegins);
    allUp.push(entry.allUp, reentry.allUp);
  }
  const all = summarize([...first, ...again]);
  const firstSummary = summarize(first);
  const againSummary = summarize(again);
  keep("page", { url: BIG_URL, elements, views: VIEWS });
  keep("enter", {
    first: firstSummary,
    again: againSummary,
    all,
    desktopViewBegins: summarize(desktopBegins),
    allViewsAndLayersUp: summarize(allUp),
    samples: { first, again, allUp },
  });
  print(
    report(
      `Entering edit mode, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "first entry after load", summary: firstSummary },
        { name: "entering again", summary: againSummary },
        { name: "all entries", summary: all, target: `median ≤ ${ENTER_TARGET_MS}ms`, met: all.median <= ENTER_TARGET_MS },
        { name: "(desktop view's frame begins)", summary: summarize(desktopBegins) },
        { name: "(every view laid out, Layers up)", summary: summarize(allUp) },
      ],
      [
        "From the click to the first frame drawn with the desktop view up, as the page starts shrinking into the canvas.",
        "Once it is in place, every view showed the canvas and the Layers panel listed it, every time.",
        "Every view laid out: the views beside the desktop view are made while the page shrinks, and show once it is in place.",
      ],
    ),
  );
  verdict(all.median <= ENTER_TARGET_MS, `entering edit mode: median ${all.median.toFixed(1)}ms, target ${ENTER_TARGET_MS}ms`);
});

test("a value changed shows in the view worked in in the next frame, its work within two frames, and in every view after", async ({ page }) => {
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
  const summaries: Record<string, { work: Summary; latency: Summary; everyView: Summary; inFirstFrame: number; frames: number[] }> = {};
  let met = true;
  for (const [name, samples] of kinds) {
    // Every step shown in every view in the end.
    expect(samples.every((s) => s.frames < Infinity), `${name}: every step shows in every view`).toBe(true);
    const work = summarize(samples.map((s) => s.work));
    const latency = summarize(samples.map((s) => s.latency));
    const everyView = summarize(samples.map((s) => s.everyView));
    const inFirstFrame = samples.filter((s) => s.firstFrame).length;
    // Every step in the first frame in the view worked in, and the work for 19 in 20 within two frames: the odd one may meet a garbage collection.
    const ok = inFirstFrame === samples.length && work.p95 <= VALUE_TARGET_MS;
    met &&= ok;
    summaries[name] = { work, latency, everyView, inFirstFrame, frames: samples.map((s) => s.frames) };
    rows.push(
      { name: `${name}: work`, summary: work, target: `p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms, in the first frame`, met: ok },
      { name: `${name}: key to frame drawn`, summary: latency },
      { name: `${name}: (key to every view)`, summary: everyView },
    );
  }
  keep("value", summaries);
  print(
    report(
      `Changing a value, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      rows,
      kinds.map(
        ([name, samples]) =>
          `${name}: ${samples.filter((s) => s.firstFrame).length} of ${samples.length} steps shown in the desktop view, worked in, in the first frame; ` +
          `every view showed each step ${Math.max(...samples.map((s) => s.frames))} frames after the key at most, and the last value after the last`,
      ),
    ),
  );
  verdict(met, "a value changed shows in the view worked in in the next frame, its work within two frames");
});

test("an arrow key held down shows each step in the view worked in in the next frame, its work within two frames; every view catches up once it is let go", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await selectCard(page, 6, { parent: true });
  const radius = await holdValue(page, "Corner radius", card(6), "border-top-left-radius");
  await selectCard(page, 6);
  const gap = await holdValue(page, "Gap", cardBody(6), "row-gap");

  const rows = [];
  const notes = [];
  const summaries: Record<string, unknown> = {};
  let met = true;
  for (const [name, held] of [
    ["corner radius (paint)", radius],
    ["Stack gap (layout)", gap],
  ] as const) {
    expect(held.steps, `${name}: every key reached the page`).toHaveLength(HELD_STEPS);
    expect(held.caughtUp, `${name}: once the key is let go, every view shows the last value`).toBeLessThan(Infinity);
    const work = summarize(held.steps.map((s) => s.work));
    const latency = summarize(held.steps.map((s) => s.latency));
    const inFirstFrame = held.steps.filter((s) => s.firstFrame).length;
    // While the key repeats, how often the views beside showed a newer step: none, they wait for the pause.
    const repeats = held.steps.slice(1);
    const besideMoved = repeats.slice(1).filter((s, i) => s.beside !== repeats[i].beside).length;
    const ok = inFirstFrame === held.steps.length && work.p95 <= VALUE_TARGET_MS;
    met &&= ok;
    summaries[name] = { work, latency, inFirstFrame, caughtUp: held.caughtUp, besideMovedWhileRepeating: besideMoved, steps: held.steps };
    rows.push(
      { name: `${name}: work`, summary: work, target: `p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms, in the first frame`, met: ok },
      { name: `${name}: key to frame drawn`, summary: latency },
    );
    notes.push(
      `${name}: ${inFirstFrame} of ${held.steps.length} steps shown in the desktop view, worked in, in the first frame; ` +
        `the views beside showed a newer step ${besideMoved} times while the key repeated; ` +
        `every view showed the last value ${ms(held.caughtUp)} after the last key (reference)`,
    );
  }
  keep("held", { delayMs: REPEAT_DELAY_MS, everyMs: REPEAT_EVERY_MS, ...summaries });
  print(report(`Holding an arrow key, ${HELD_STEPS} steps every ${REPEAT_EVERY_MS.toFixed(1)}ms after ${REPEAT_DELAY_MS}ms, ${elements} elements, ${VIEWS.length} views — ${mode}`, rows, notes));
  verdict(met, "a value stepped by a held key shows each step in the view worked in in the next frame, its work within two frames");
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

/**
 * docs/goals.md, Robust: while the Agent applies a round, the page checks the
 * changes not shown yet each time the code changes (ticket 64), and that must
 * never make a long task on a page of about 5000 elements. Three changes to
 * the 96 product cards (two to the card, one to its body's Stack, every check
 * reading all 96 of them, at the page's width and at the tablet's and the
 * phone's on copies of the page), then four hot updates to the cards' code:
 * one that applies none of them, then one per change. Each stretch of
 * checking is a `vernierkit:check` measure; a long task is the check's when
 * it would not be one without the checking in it. For reference, the same
 * hot updates with no round claimed: the page's own long tasks. The claim is
 * measured too: the page looks at every change, and makes its copies; and
 * with the first hot update, `done` for all three, which the page answers as
 * the code comes in.
 */
test.describe("a claimed round", () => {
  test.use({ keepRoundInMemory: false });
  const REACT18 = fileURLToPath(new URL("../../examples/vite-react18-tw3/", import.meta.url));
  const PARTS = `${REACT18}src/big/parts.tsx`;
  const VERNIER = `${REACT18}.vernier`;
  const CLI = fileURLToPath(new URL("../../packages/vernierkit/dist/cli.js", import.meta.url));
  const original = readFileSync(PARTS, "utf8");
  const vernierkit = async (...args: string[]) => (await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: REACT18 })).stdout;
  const served = async () => (await (await fetch(new URL("/src/big/parts.tsx", BIG_URL))).text()).includes("Made in small batches");
  test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
  test.afterEach(async () => {
    writeFileSync(PARTS, original);
    rmSync(VERNIER, { recursive: true, force: true });
    await expect.poll(served).toBe(true);
  });

  const CARD = `<article className="flex flex-col overflow-hidden rounded-card border border-brand-100 bg-white shadow-card" data-testid="product">`;
  /** Each hot update: the edit to the cards' code, and what the first card shows once it is in. */
  const UPDATES = [
    { name: "no change applied, done asked for all three", from: "Made in small batches", to: "Made in small lots", shows: () => document.querySelector("[data-testid=product] p")!.textContent!.includes("small lots") },
    { name: "corner radius applied", from: CARD, to: CARD.replace("rounded-card", "rounded-[20px]"), shows: () => getComputedStyle(document.querySelector("[data-testid=product]")!).borderTopLeftRadius === "20px" },
    { name: "fill applied", from: "border-brand-100 bg-white shadow-card", to: "border-brand-100 bg-[#fafafa] shadow-card", shows: () => getComputedStyle(document.querySelector("[data-testid=product]")!).backgroundColor === "rgb(250, 250, 250)" },
    { name: "gap applied", from: "flex flex-1 flex-col gap-2 p-gutter", to: "flex flex-1 flex-col gap-[10px] p-gutter", shows: () => getComputedStyle(document.querySelector("[data-testid=product] > div:nth-of-type(2)")!).rowGap === "10px" },
  ];

  interface Seen {
    long: { start: number; duration: number }[];
    checks: { start: number; duration: number }[];
  }
  function arm() {
    const w = window as unknown as { vkSeen: Seen; vkStop: () => void };
    const seen: Seen = { long: [], checks: [] };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) (entry.entryType === "longtask" ? seen.long : seen.checks).push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask" });
    observer.observe({ type: "measure" });
    w.vkSeen = seen;
    w.vkStop = () => observer.disconnect();
  }

  /**
   * Makes each hot update in turn, waits till the page shows it and has
   * settled; what was seen meanwhile, per update. `asking`: with the first,
   * the Agent runs `done` for every change, which the page answers as the code comes in.
   */
  async function hotUpdates(page: Page, asking?: () => Promise<unknown>) {
    const per: (Seen & { name: string })[] = [];
    for (const [i, { name, from, to, shows }] of UPDATES.entries()) {
      await page.evaluate(arm);
      const text = readFileSync(PARTS, "utf8");
      expect(text).toContain(from);
      writeFileSync(PARTS, text.replace(from, to));
      const asked = i === 0 ? asking?.() : undefined;
      await expect.poll(() => page.evaluate(shows), { timeout: 20_000 }).toBe(true);
      await asked;
      await settle(page, 2000);
      const seen = await page.evaluate(() => {
        const w = window as unknown as { vkSeen: Seen; vkStop: () => void };
        w.vkStop();
        return { long: w.vkSeen.long, checks: w.vkSeen.checks.filter((entry) => entry.duration >= 0) };
      });
      per.push({ name, ...seen, checks: seen.checks });
    }
    return per;
  }

  /** Looks run back to back, one task each: a stretch of checking. */
  function stretches(checks: Seen["checks"]) {
    const sorted = [...checks].sort((a, b) => a.start - b.start);
    const out: { start: number; end: number; checking: number }[] = [];
    for (const { start, duration } of sorted) {
      const last = out.at(-1);
      if (last && start - last.end < 1) {
        last.end = start + duration;
        last.checking += duration;
      } else out.push({ start, end: start + duration, checking: duration });
    }
    return out;
  }

  test("while a round is claimed, the page checks the changes on each hot update with no long task of its own", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    await selectCard(page, 6, { parent: true });
    for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
      const box = design(page).getByRole("textbox", { name: field, exact: true });
      await box.fill(value);
      await box.press("Enter");
    }
    await selectCard(page, 6);
    const gap = design(page).getByRole("textbox", { name: "Gap", exact: true });
    await gap.fill("10");
    await gap.press("Enter");
    await expect.poll(() => (existsSync(`${VERNIER}/changeset.json`) ? JSON.parse(readFileSync(`${VERNIER}/changeset.json`, "utf8")).changes.length : 0)).toBe(3);
    // The claim too: the page looks at every change once, and makes its copies at the views' widths.
    await page.evaluate(arm);
    await vernierkit("claim");
    const ring = page.getByRole("progressbar", { name: "Applying design changes" });
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await settle(page, 2000);
    const atClaim = await page.evaluate(() => {
      const w = window as unknown as { vkSeen: Seen; vkStop: () => void };
      w.vkStop();
      return w.vkSeen;
    });

    let answered = "";
    const claimed = [{ name: "claim", ...atClaim }, ...(await hotUpdates(page, async () => (answered = await vernierkit("done", "1", "2", "3"))))];
    // None applied by that first update: done waited for it, and says so for each.
    expect(answered).toContain("Changes 1, 2 and 3 done: 0 of 3 changes applied.");
    await expect(ring).toHaveAttribute("aria-valuenow", "3");
    await vernierkit("finish");
    await expect(ring).toHaveCount(0);

    // The same hot updates with no round claimed: the page's own long tasks.
    writeFileSync(PARTS, original);
    await expect.poll(served).toBe(true);
    await openBigPage(page);
    const unclaimed = await hotUpdates(page);

    const rows = claimed.map(({ name, long, checks }, i) => {
      const own = stretches(checks);
      // A long task the check makes: one that would not be long without the checking in it.
      const ofCheck = long.filter((task) => {
        const checking = own.filter((s) => s.start >= task.start && s.end <= task.start + task.duration + 1).reduce((sum, s) => sum + s.checking, 0);
        return checking > 0 && task.duration - checking < 50;
      });
      return {
        name,
        looks: checks.length,
        stretches: own.length,
        longestStretch: Math.max(0, ...own.map((s) => s.end - s.start)),
        checking: own.reduce((sum, s) => sum + s.checking, 0),
        longTasks: long.map((task) => task.duration),
        longTasksOfCheck: ofCheck.map((task) => task.duration),
        longTasksUnclaimed: i === 0 ? [] : unclaimed[i - 1].long.map((task) => task.duration),
      };
    });
    const longest = Math.max(...rows.map((row) => row.longestStretch));
    const ofCheck = rows.flatMap((row) => row.longTasksOfCheck);
    const met = ofCheck.length === 0 && longest < 50;
    keep("claimedChecks", { elements, rows });
    print(
      report(
        `Checking a claimed round on hot updates, ${elements} elements, 3 changes to 96 cards, views 768 and 390 — ${mode}`,
        [
          { name: "longest stretch of checking", summary: summarize(rows.map((row) => row.longestStretch)), target: "< 50ms, no long task of its own", met },
          { name: "checking per hot update", summary: summarize(rows.map((row) => row.checking)) },
        ],
        rows.map(
          (row) =>
            `${row.name}: ${row.looks} looks in ${row.stretches} stretches, the longest ${ms(row.longestStretch)}; long tasks ${row.longTasks.map((d) => d.toFixed(0)).join(", ") || "none"} (the check's: ${row.longTasksOfCheck.length}); with no round claimed: ${row.longTasksUnclaimed.map((d) => d.toFixed(0)).join(", ") || "none"}`,
        ),
      ),
    );
    verdict(met, `checking a claimed round: longest stretch ${longest.toFixed(1)}ms, ${ofCheck.length} long tasks of its own`);
  });
});

/**
 * docs/goals.md, Robust (ticket 65): a style change made in the tablet view,
 * whose range (560–1119px, `sm:max-lg:`) the project's `md` breakpoint at
 * 820px cuts in two, has the
 * editor layer read what the page shows now in each part, on a copy of the
 * page at a width in it, and save it with the change. On this page of about
 * 5000 elements that must make no long task: not once the designer has
 * stopped, nor when they leave edit mode at once, which has the reading
 * finish after. Three changes to the hero made one after another in the
 * tablet view, each read once the designer stops; then two each followed at
 * once by going back to preview mode. Each stretch of reading is a
 * `vernierkit:parts` measure; a long task is the reading's when it would not
 * be one without the reading in it, as for the check.
 */
test.describe("a change at a breakpoint", () => {
  test.use({ keepRoundInMemory: false });
  const VERNIER = fileURLToPath(new URL("../../examples/vite-react18-tw3/.vernier", import.meta.url));
  test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
  test.afterEach(() => rmSync(VERNIER, { recursive: true, force: true }));

  const HERO = "[data-testid=big-hero]";
  const HERO_PICTURE = `${HERO} img`;
  const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]').contentFrame();
  const changes = (): { id: number; parts?: unknown[] | null }[] => (existsSync(`${VERNIER}/changeset.json`) ? JSON.parse(readFileSync(`${VERNIER}/changeset.json`, "utf8")).changes : []);

  interface Seen {
    long: { start: number; duration: number }[];
    reads: { start: number; duration: number }[];
  }
  function arm() {
    const w = window as unknown as { vkSeen: Seen; vkStop: () => void };
    const seen: Seen = { long: [], reads: [] };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "longtask") seen.long.push({ start: entry.startTime, duration: entry.duration });
        else if (entry.name === "vernierkit:parts") seen.reads.push({ start: entry.startTime, duration: entry.duration });
      }
    });
    observer.observe({ type: "longtask" });
    observer.observe({ type: "measure" });
    w.vkSeen = seen;
    w.vkStop = () => observer.disconnect();
  }

  /** Selects the deepest layer at a point just inside `selector`'s box in the tablet view: edits apply from 560px to 1119px. */
  async function selectInTablet(page: Page, selector: string) {
    const box = (await tablet(page).locator(selector).boundingBox())!;
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.click(box.x + 3, box.y + 3);
    await page.keyboard.up("ControlOrMeta");
    await settle(page);
  }

  /** Sets `field` to `value`; with `leave`, goes back to preview mode at once. Waits till change `id` is saved with the parts of its range read; what was seen meanwhile. */
  async function changeAndRead(page: Page, id: number, field: string, value: string, leave = false) {
    await page.evaluate(arm);
    const box = design(page).getByRole("textbox", { name: field, exact: true });
    await box.fill(value);
    await box.press("Enter");
    if (leave) await page.getByRole("button", { name: EXIT_LABEL }).click();
    const started = Date.now();
    await expect.poll(() => changes().find((change) => change.id === id)?.parts?.length ?? 0, { timeout: 20_000 }).toBe(2);
    const saved = Date.now() - started;
    await settle(page, 1000);
    const seen = await page.evaluate(() => {
      const w = window as unknown as { vkSeen: Seen; vkStop: () => void };
      w.vkStop();
      return w.vkSeen;
    });
    const own = [...seen.reads].sort((a, b) => a.start - b.start);
    const ofReading = seen.long.filter((task) => {
      const reading = own.filter((s) => s.start >= task.start && s.start + s.duration <= task.start + task.duration + 1).reduce((sum, s) => sum + s.duration, 0);
      return reading > 0 && task.duration - reading < 50;
    });
    return {
      name: `${field}${leave ? ", then back to preview mode at once" : ""}`,
      saved,
      stretches: own.length,
      longest: Math.max(0, ...own.map((s) => s.duration)),
      reading: own.reduce((sum, s) => sum + s.duration, 0),
      longTasks: seen.long.map((task) => task.duration),
      longTasksOfReading: ofReading.map((task) => task.duration),
    };
  }

  test("reading what the page shows in each part of a change's range makes no long task, the designer stopped or gone back to preview mode", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    await selectInTablet(page, HERO);
    const rows = [];
    rows.push(await changeAndRead(page, 1, "Corner radius", "20"));
    rows.push(await changeAndRead(page, 2, "Fill color", "fafafa"));
    rows.push(await changeAndRead(page, 3, "Gap", "10"));
    keep("rangeParts", { elements, rows });
    rows.push(await changeAndRead(page, 4, "Opacity", "90", true));
    await enterEditMode(page);
    await selectInTablet(page, HERO_PICTURE);
    rows.push(await changeAndRead(page, 5, "Corner radius", "12", true));

    const longest = Math.max(...rows.map((row) => row.longest));
    const ofReading = rows.flatMap((row) => row.longTasksOfReading);
    const met = ofReading.length === 0 && longest < 50;
    keep("rangeParts", { elements, rows });
    print(
      report(
        `Reading each part of a tablet-view change's range, ${elements} elements, 2 parts (560–819px, 820–1119px) — ${mode}`,
        [
          { name: "longest stretch of reading", summary: summarize(rows.map((row) => row.longest)), target: "< 50ms, no long task of its own", met },
          { name: "reading per change", summary: summarize(rows.map((row) => row.reading)) },
          { name: "edit to parts saved", summary: summarize(rows.map((row) => row.saved)) },
        ],
        rows.map(
          (row) =>
            `${row.name}: ${row.stretches} stretches, the longest ${ms(row.longest)}, ${ms(row.reading)} in all, saved ${row.saved}ms after; long tasks ${row.longTasks.map((d) => d.toFixed(0)).join(", ") || "none"} (the reading's: ${row.longTasksOfReading.length})`,
        ),
      ),
    );
    verdict(met, `reading the parts of a change's range: longest stretch ${longest.toFixed(1)}ms, ${ofReading.length} long tasks of its own`);
  });
});
