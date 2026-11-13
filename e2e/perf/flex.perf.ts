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
 * In the headless shell (`HT_PERF_HEADLESS=1`) the numbers are for comparing
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
/** Runs of two steps of a value then ⌘Z and ⇧⌘Z, per kind of change. */
const UNDO_RUNS = 20;
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
  return page.locator("human-touch");
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
  const w = window as unknown as { htEnter: Promise<Entered> };
  w.htEnter = new Promise((resolve) => {
    const shadow = () => document.querySelector("human-touch")?.shadowRoot ?? null;
    const frameOf = (root: ShadowRoot, title: string) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
    const shows = (root: ShadowRoot, title: string) => !!frameOf(root, title)?.contentDocument?.querySelector("[data-testid=big-hero]");
    const desktopUp = (root: ShadowRoot | null): root is ShadowRoot => {
      const stage = root?.querySelector<HTMLElement>(".ht-stage");
      const shell = root?.querySelector<HTMLElement>(".ht-viewport")?.parentElement;
      return !!root && stage?.style.visibility === "visible" && shell?.style.opacity !== "0" && shows(root, views[0]);
    };
    const allUp = (root: ShadowRoot) => !!root.querySelector('[role="tree"] [role="treeitem"]') && views.every((title) => shows(root, title));
    const travelling = (root: ShadowRoot) => !!root.querySelector(".ht-viewport.is-travelling");
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
  const { click, desktop, desktopDrawn, allUp, allUpAtEnd } = await page.evaluate(() => (window as unknown as { htEnter: Promise<Entered> }).htEnter);
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

/**
 * What the designer would click at a point, if not the canvas: nothing, the
 * point being out of the window, or the editor's own toolbar, panel or brief
 * card floating over the canvas there (ticket 124). Undefined when the
 * canvas, a view on it, is there to click.
 */
function coveringAt(page: Page, at: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return `out of the ${innerWidth}×${innerHeight} window`;
    const hit = document.querySelector("human-touch")!.shadowRoot!.elementFromPoint(x, y);
    // Over the canvas, the editor's own controls: the selection toolbar, a brief card, a view's label.
    const over = hit?.closest(".ht-viewport") ? hit.closest("button, input, textarea, select, a, [role=toolbar], .ht-brief-card, .ht-view-title") : hit;
    return over ? `${over.tagName.toLowerCase()}.${[...over.classList].join(".")}` : hit ? undefined : "nothing";
  }, at);
}

/** Expects the canvas at a point, nothing over it, for a click: else fails saying what covers it (ticket 124). */
async function expectCanvasAt(page: Page, at: { x: number; y: number }) {
  expect(await coveringAt(page, at), `the canvas to click at ${at.x.toFixed(0)}, ${at.y.toFixed(0)}, nothing covering it`).toBeUndefined();
}

/** How far in from the Canvas viewport's edges a point to click must be: off the panels' and the window's edges beside it. */
const EDGE_MARGIN = 8;
/** How far in a card `bringCardIntoSight` brings is: well in sight, not half out at an edge, as the designer would scroll it. */
const SIGHT_MARGIN = 40;

/** Whether a point is in the Canvas viewport, `margin` in from its edges. */
function inViewport(viewport: { x: number; y: number; width: number; height: number }, at: { x: number; y: number }, margin = EDGE_MARGIN) {
  return at.x > viewport.x + margin && at.y > viewport.y + margin && at.x < viewport.x + viewport.width - margin && at.y < viewport.y + viewport.height - margin;
}

/** Where `selectDeepestIn` clicks for `box`: just inside its top left corner. */
const justInside = (box: { x: number; y: number }) => ({ x: box.x + 3, y: box.y + 3 });

/** Selects the deepest layer at a point just inside `box`: a click with ⌘ (Ctrl) held, on the canvas, nothing over it. */
async function selectDeepestIn(page: Page, box: { x: number; y: number }) {
  const at = justInside(box);
  await expectCanvasAt(page, at);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up("ControlOrMeta");
}

/**
 * Pans the canvas with the wheel, as the designer scrolls it, till the point
 * `selectDeepestIn` clicks in the body of the `n`th card of the desktop view
 * is on the canvas, nothing over it, away from the viewport's edges. A card
 * below the window's bottom otherwise takes a click no designer could make
 * (ticket 124).
 */
async function bringCardIntoSight(page: Page, n: number) {
  const viewport = (await host(page).getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  const middle = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  for (let pans = 0; ; pans++) {
    const box = (await canvas(page).locator(cardBody(n)).boundingBox())!;
    const at = justInside(box);
    if (inViewport(viewport, at, SIGHT_MARGIN) && !(await coveringAt(page, at))) return;
    expect(pans, `card ${n} brought into sight`).toBeLessThan(5);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(at.x - middle.x, at.y - middle.y);
    await settle(page, 200);
  }
}

/** Selects the deepest layer at a point in the body's padding, the body itself, in the desktop view; with `parent`, the card around it. */
async function selectCard(page: Page, n: number, { parent = false } = {}) {
  await selectDeepestIn(page, (await canvas(page).locator(cardBody(n)).boundingBox())!);
  if (parent) await page.keyboard.press("Escape");
  await settle(page);
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

/**
 * A field of the Design panel to type into: a value the code writes with a
 * Variable shows it by name (ticket 119), detached first, as in Figma.
 */
async function fieldOf(page: Page, name: string) {
  const detach = design(page).getByRole("button", { name: `Detach ${name.toLowerCase()} variable`, exact: true });
  if (await detach.isVisible()) await detach.click();
  return design(page).getByRole("textbox", { name, exact: true });
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
  const w = window as unknown as { htValue: Promise<ValueSample> };
  const { scheduler } = window as unknown as WithScheduler;
  w.htValue = new Promise((resolve) => {
    const root = document.querySelector("human-touch")!.shadowRoot!;
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
async function everyViewShows(page: Page, selector: string, property: string, value: string, views = VIEWS) {
  for (const title of views) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator(selector)).toHaveCSS(property, value);
}

/** Steps a value up with the arrow key, `VALUE_STEPS` times, measuring each, in `views`, the first worked in. */
async function stepValue(page: Page, field: string, selector: string, property: string, views = VIEWS) {
  await (await fieldOf(page, field)).focus();
  const samples: ValueSample[] = [];
  for (let i = 0; i < VALUE_STEPS; i++) {
    const expected = `${parseFloat(await valueOnCanvas(page, selector, property)) + 1}px`;
    await page.evaluate(armValue, { views, selector, property, expected });
    await page.keyboard.press("ArrowUp");
    samples.push(await page.evaluate(() => (window as unknown as { htValue: Promise<ValueSample> }).htValue));
    await settle(page, 150);
  }
  // After the last step, every view shows the last value.
  await everyViewShows(page, selector, property, await valueOnCanvas(page, selector, property), views);
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
  const root = document.querySelector("human-touch")!.shadowRoot!;
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
  (window as unknown as { htHeld: HeldRecord }).htHeld = record;
}

/**
 * Holds the arrow key down on a value for `HELD_STEPS` steps, as macOS
 * repeats it: each key sent straight to the browser at its time, without
 * waiting for the page to take the last, as the keyboard does. Once it is let
 * go, waits till every view shows the last value.
 */
async function holdValue(page: Page, field: string, selector: string, property: string): Promise<Held> {
  await (await fieldOf(page, field)).focus();
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
  const held = await page.evaluate(() => (window as unknown as { htHeld: HeldRecord }).htHeld.done);
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
  /** Frames in which `shows` was on screen: where the layer would go, or the size of the layer resized. */
  withLine: number;
  long: number[];
  moves: number;
  stop(): void;
}

function armFrames(shows: string) {
  const w = window as unknown as { htFrames: FrameRecord };
  const root = document.querySelector("human-touch")!.shadowRoot!;
  const record: FrameRecord = { times: [], withLine: 0, long: [], moves: 0, stop() {} };
  const moved = () => record.moves++;
  addEventListener("pointermove", moved, true);
  let on = true;
  const loop = (time: number) => {
    record.times.push(time);
    if (root.querySelector(shows)) record.withLine++;
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
  w.htFrames = record;
}

/**
 * Presses the pointer at `from` and drags it for `DRAG_MS`, to where `path`
 * has it each moment (`elapsed` ms in), recording the frames meanwhile, and
 * those with `shows` on screen (`armFrames`); then Esc takes the drag back,
 * so the next one starts from the same page.
 */
async function dragFor(page: Page, from: { x: number; y: number }, shows: string, path: (elapsed: number) => [number, number]) {
  await page.mouse.move(from.x, from.y);
  await page.evaluate(armFrames, shows);
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
      const [x, y] = path(elapsed);
      sent.push(cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 }));
    }, POINTER_EVERY_MS);
  });
  await Promise.all(sent);
  await cdp.detach();
  const record = await page.evaluate(() => {
    const record = (window as unknown as { htFrames: FrameRecord }).htFrames;
    record.stop();
    return { times: record.times, withLine: record.withLine, long: record.long, moves: record.moves };
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await settle(page);
  return record;
}

/** Drags card `n`, selected, back and forth over the cards beside it and the row below, for `DRAG_MS`; then Esc puts it back where it was. */
async function dragCard(page: Page, n: number) {
  const box = (await canvas(page).locator(card(n)).boundingBox())!;
  const step = (await canvas(page).locator(card(n + 1)).boundingBox())!.x - box.x;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  return dragFor(page, from, ".ht-drop-line", (elapsed) => {
    // Across two cards and back, and down a row and back, once every 1.25s.
    const phase = (elapsed / 1250) * 2 * Math.PI;
    return [from.x + Math.sin(phase) * step * 2, from.y + (1 - Math.cos(phase)) * box.height * 0.6];
  });
}

/**
 * Presses the bottom right handle of the card selected and drags it about for
 * `DRAG_MS`, the card wider and taller and back, every instance of it with it
 * (ticket 69); then Esc takes the resize back, so the next one starts from the
 * same card. The pointer is sent as `dragCard` sends it.
 */
async function resizeCard(page: Page) {
  const corner = (await host(page).locator('.ht-handles[data-view="Desktop"] .ht-handle[data-handle="se"]').boundingBox())!;
  const from = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  return dragFor(page, from, ".ht-size-label", (elapsed) => {
    // Out and back once every 1.25s: up to 80 screen px wider and 60 taller, never back within the threshold of where it was pressed.
    const phase = (elapsed / 1250) * 2 * Math.PI;
    return [from.x + 10 + (1 - Math.cos(phase)) * 40, from.y + 10 + (1 - Math.cos(phase)) * 30];
  });
}

type DragRecord = Awaited<ReturnType<typeof dragFor>>;

/**
 * The frames of several drags, against ticket 22's standard for a drag: 60fps
 * kept, as many frames as that in every drag (58 or more, give or take the odd
 * one), 19 in 20 frames on time (p95 within 1.25 frames) and fewer than 1 in
 * 20 late (more than 1.5 frames apart). Also the pointer moves that reached
 * the page, per second of each drag: Chrome hands the page at most one a frame.
 */
function dragFrames(records: DragRecord[]) {
  const intervals = records.flatMap((record) => record.times.slice(1).map((time, j) => time - record.times[j]));
  const perSecond = (n: number, record: DragRecord) => (n / (record.times.at(-1)! - record.times[0])) * 1000;
  const fps = summarize(records.map((record) => perSecond(record.times.length - 1, record)), { higherIsBetter: true });
  const frames = summarize(intervals);
  const moves = summarize(records.map((record) => perSecond(record.moves, record)), { higherIsBetter: true });
  const long = records.flatMap((record) => record.long);
  const dropped = intervals.filter((gap) => gap > FRAME_MS * 1.5).length;
  const [fpsMet, onTime, fewLate] = [fps.worst >= 58, frames.p95 <= FRAME_MS * 1.25, dropped < intervals.length / 20];
  /** The rows of the report, `per` what: "drag", "resize". */
  const rows = (per: string) => [
    { name: `frames per second, per ${per}`, summary: fps, unit: (v: number) => v.toFixed(1), target: `every ${per} ≥ 58`, met: fpsMet },
    { name: `pointer moves per second, per ${per}`, summary: moves, unit: (v: number) => v.toFixed(0) },
    { name: "time between frames", summary: frames, target: `p95 ≤ ${(FRAME_MS * 1.25).toFixed(1)}ms`, met: onTime },
  ];
  const note = `${dropped} of ${intervals.length} frames late (more than 1.5 frames apart; target fewer than 5%); ${long.length} long tasks${long.length ? `, the longest ${Math.max(...long).toFixed(0)}ms` : ""}.`;
  return { fps, frames, moves, long, dropped, count: intervals.length, met: fpsMet && onTime && fewLate, rows, note };
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

/** What `hearKeysFirst` tells of each key pressed, if anything listens. */
interface WithKeysFirst {
  htKeyFirst?: (event: KeyboardEvent) => void;
}

/**
 * Before any of the page's own: a listener for every key pressed, first of all
 * at the window, that tells `window.htKeyFirst` of it. The editor layer takes
 * ⌘Z and ⇧⌘Z at the window, as they come, so a listener added once it is up
 * would hear them only once they are handled.
 */
function hearKeysFirst() {
  addEventListener("keydown", (event) => (window as unknown as WithKeysFirst).htKeyFirst?.(event), true);
}

interface UndoRedoSample {
  /** As the key came, the views beside showed something else than the view worked in: they waited for the steps to pause. */
  behind: boolean;
  /** In the first frame drawn after the key, the view worked in showed the value undone or redone to. */
  firstFrame: boolean;
  /** In that frame, every view did (ADR 0011). */
  everyViewFirstFrame: boolean;
  /** The main thread's time on it, as `ValueSample.work`: handling the key, then drawing that frame. */
  work: number;
  /** Of `work`, handling the key. */
  handling: number;
  /** Of `work`, that frame from its first callback to being drawn: every view's style, layout and paint. */
  drawing: number;
  /** From the key press to that frame drawn; with a screen, this includes waiting for its next refresh. */
  latency: number;
}

/**
 * ⌘Z or ⇧⌘Z, measured as `armValue` measures a key that changes a value, in
 * every view at once: the views beside show it in the same frame as the view
 * worked in, `views[0]` (ADR 0011). The editor layer handles the key first
 * thing at the window, and stops it there: the time it arrived is taken by
 * `hearKeysFirst`, before any of the page's listeners, and the time it was
 * handled by a listener at the window added now, after the editor layer's.
 * Waits for the frame under way to be drawn before listening.
 */
function armUndoRedo({ views, selector, property, expected, code }: { views: string[]; selector: string; property: string; expected: string; code?: string }) {
  const w = window as unknown as WithKeysFirst & { htUndoRedo: Promise<UndoRedoSample> };
  const { scheduler } = window as unknown as WithScheduler;
  const root = document.querySelector("human-touch")!.shadowRoot!;
  const docs = views.map((title) => root.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!);
  const valueIn = (doc: Document) => getComputedStyle(doc.querySelector(selector)!).getPropertyValue(property);
  /** ⌘Z or ⇧⌘Z (Ctrl on other systems): the keys pressed here; with `code`, ⌥⌘ and that key, as ⌥⌘V (ticket 117). */
  const isUndoOrRedo = (event: KeyboardEvent) =>
    (code ? event.code === code && event.altKey : event.key.toLowerCase() === "z") && (event.metaKey || event.ctrlKey);
  return new Promise<void>((armed) =>
    requestAnimationFrame(() =>
      scheduler.postTask(
        () => {
          w.htUndoRedo = new Promise((resolve) => {
            let start = 0;
            let arrived = 0;
            let handled = 0;
            let behind = false;
            let frames = 0;
            let first = { at: 0, drawn: 0, worked: false, everyView: false };
            const frame = () => {
              frames++;
              const at = performance.now();
              // Once the frame has been drawn, before what the page has queued meanwhile (see `armEnter`).
              scheduler.postTask(
                () => {
                  const drawn = performance.now();
                  const shown = docs.map(valueIn).map((value) => value === expected);
                  if (frames === 1) first = { at, drawn, worked: shown[0], everyView: shown.every(Boolean) };
                  if (!shown.every(Boolean) && frames < 60) return requestAnimationFrame(frame);
                  const handling = (handled || first.at) - start;
                  resolve({
                    behind,
                    firstFrame: first.worked,
                    everyViewFirstFrame: first.everyView,
                    work: handling + (first.drawn - first.at),
                    handling,
                    drawing: first.drawn - first.at,
                    latency: first.drawn - arrived,
                  });
                },
                { priority: "user-blocking" },
              );
            };
            w.htKeyFirst = (event) => {
              if (!isUndoOrRedo(event)) return;
              w.htKeyFirst = undefined;
              // Read before the time starts: the frame before has been drawn, so this lays nothing out.
              const shown = docs.map(valueIn);
              behind = shown.slice(1).some((value) => value !== shown[0]);
              start = performance.now();
              arrived = event.timeStamp;
              // Asked for before the page handles the key, as `armValue` does: the first frame callback is this one.
              requestAnimationFrame(frame);
            };
            // After the editor layer's, which stops the key from going further.
            const onHandled = (event: KeyboardEvent) => {
              if (!isUndoOrRedo(event)) return;
              handled = performance.now();
              removeEventListener("keydown", onHandled, true);
            };
            addEventListener("keydown", onHandled, true);
          });
          armed();
        },
        { priority: "user-blocking" },
      ),
    ),
  );
}

/**
 * `UNDO_RUNS` times, a value stepped up twice with the arrow key, then right
 * away ⌘Z, measured, and ⇧⌘Z, measured: undone back one step, redone. The
 * views beside wait for the steps to pause as ⌘Z comes, and are caught up by
 * it, so as ⇧⌘Z comes they wait for nothing (any step between would leave
 * nothing to redo); it shows in every view at once too.
 */
async function undoAndRedo(page: Page, field: string, selector: string, property: string) {
  await (await fieldOf(page, field)).focus();
  const undo: UndoRedoSample[] = [];
  const redo: UndoRedoSample[] = [];
  const measured = () => page.evaluate(() => (window as unknown as { htUndoRedo: Promise<UndoRedoSample> }).htUndoRedo);
  for (let i = 0; i < UNDO_RUNS; i++) {
    const from = parseFloat(await valueOnCanvas(page, selector, property));
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    // Each press of ↑ a step of its own: undone, one step back.
    await page.evaluate(armUndoRedo, { views: VIEWS, selector, property, expected: `${from + 1}px` });
    await page.keyboard.press("ControlOrMeta+z");
    undo.push(await measured());
    await page.evaluate(armUndoRedo, { views: VIEWS, selector, property, expected: `${from + 2}px` });
    await page.keyboard.press("ControlOrMeta+Shift+z");
    redo.push(await measured());
    await settle(page, 150);
  }
  await everyViewShows(page, selector, property, await valueOnCanvas(page, selector, property));
  return { undo, redo };
}

/**
 * Ticket 73: ⌘Z and ⇧⌘Z right after steps of a value, while the views beside
 * wait for the steps to pause: every view shows what is undone or redone in
 * the same frame (ADR 0011), so that frame draws all three. Measured as a
 * value changed, the target the same.
 */
test("⌘Z and ⇧⌘Z right after steps of a value show in every view in the next frame, their work within two frames", async ({ page }) => {
  await page.addInitScript(hearKeysFirst);
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await selectCard(page, 6, { parent: true });
  const radius = await undoAndRedo(page, "Corner radius", card(6), "border-top-left-radius");
  await selectCard(page, 6);
  const gap = await undoAndRedo(page, "Gap", cardBody(6), "row-gap");

  const rows = [];
  const notes = [];
  const summaries: Record<string, unknown> = {};
  let met = true;
  for (const [kind, keys] of [
    ["corner radius (paint)", radius],
    ["Stack gap (layout)", gap],
  ] as const) {
    for (const [key, samples] of [
      ["⌘Z", keys.undo],
      ["⇧⌘Z", keys.redo],
    ] as const) {
      const name = `${kind}, ${key}`;
      const behind = samples.filter((s) => s.behind).length;
      // The views beside waited for the steps to pause as each ⌘Z came: what this is to measure.
      if (key === "⌘Z") expect(behind, `${name}: the views beside wait as each key comes`).toBe(samples.length);
      const work = summarize(samples.map((s) => s.work));
      const handling = summarize(samples.map((s) => s.handling));
      const drawing = summarize(samples.map((s) => s.drawing));
      const latency = summarize(samples.map((s) => s.latency));
      const inFirstFrame = samples.filter((s) => s.everyViewFirstFrame).length;
      const ok = inFirstFrame === samples.length && work.p95 <= VALUE_TARGET_MS;
      met &&= ok;
      summaries[name] = { work, handling, drawing, latency, everyViewInFirstFrame: inFirstFrame, behind, samples };
      rows.push(
        { name: `${name}: work`, summary: work, target: `p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms, every view in the first frame`, met: ok },
        { name: `${name}: (handling the key)`, summary: handling },
        { name: `${name}: (drawing the frame)`, summary: drawing },
        { name: `${name}: key to frame drawn`, summary: latency },
      );
      notes.push(
        `${name}: ${inFirstFrame} of ${samples.length} shown in every view in the first frame ` +
          `(the desktop view: ${samples.filter((s) => s.firstFrame).length}); the views beside waiting as the key came: ${behind}`,
      );
    }
  }
  keep("undoRedo", summaries);
  print(report(`⌘Z and ⇧⌘Z right after two steps of a value, ${UNDO_RUNS} each, ${elements} elements, ${VIEWS.length} views — ${mode}`, rows, notes));
  verdict(met, "⌘Z and ⇧⌘Z right after steps of a value show in every view in the next frame, their work within two frames");
});

/**
 * Ticket 117: ⌥⌘V on a card of the 96 of one usage, against one panel edit
 * of it, its corner radius typed in the panel and applied with Enter. Like
 * for like: each changes the round's change to the radius, neither makes it
 * nor takes it away (a value back to the page's own takes the change out of
 * the round, which redraws more). So the radius is made 5px more first, and
 * the card's style copied with ⌥⌘C; each run, 1px more is typed (measured as
 * a value changed), the field left, and the style pasted back (measured as
 * ⌘Z is: the editor layer takes ⌥⌘V at the window): 5px more again, every
 * other value copied read and found the same. A paste is a value set once,
 * not a step of a run: the views beside show it a frame later (ADR 0011).
 */
test("⌥⌘V on one of 96 cards shows in the view worked in in the next frame, its work no more than a value changed in the panel", async ({ page }) => {
  await page.addInitScript(hearKeysFirst);
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await selectCard(page, 6, { parent: true });
  const selector = card(6);
  const property = "border-top-left-radius";
  const field = (await fieldOf(page, "Corner radius"));
  const own = parseFloat(await valueOnCanvas(page, selector, property));
  const copied = `${own + 5}px`;
  await field.fill(String(own + 5));
  await field.press("Enter");
  await field.blur();
  await everyViewShows(page, selector, property, copied);
  await page.keyboard.press("Alt+ControlOrMeta+KeyC");
  const edits: ValueSample[] = [];
  const pastes: UndoRedoSample[] = [];
  const typed = `${own + 1}px`;
  for (let i = 0; i < UNDO_RUNS; i++) {
    await field.focus();
    await field.fill(String(parseFloat(typed)));
    await page.evaluate(armValue, { views: VIEWS.slice(0, 1), selector, property, expected: typed });
    await page.keyboard.press("Enter");
    edits.push(await page.evaluate(() => (window as unknown as { htValue: Promise<ValueSample> }).htValue));
    await field.blur();
    await settle(page, 150);
    await page.evaluate(armUndoRedo, { views: VIEWS, selector, property, expected: copied, code: "KeyV" });
    await page.keyboard.press("Alt+ControlOrMeta+KeyV");
    pastes.push(await page.evaluate(() => (window as unknown as { htUndoRedo: Promise<UndoRedoSample> }).htUndoRedo));
    await settle(page, 150);
  }
  await everyViewShows(page, selector, property, copied);

  const edit = summarize(edits.map((s) => s.work));
  const paste = summarize(pastes.map((s) => s.work));
  const handling = summarize(pastes.map((s) => s.handling));
  const latency = summarize(pastes.map((s) => s.latency));
  const inFirstFrame = pastes.filter((s) => s.firstFrame).length;
  // Not slower to be seen: in the first frame, within two frames, and within a frame of the panel edit's.
  const met = inFirstFrame === pastes.length && paste.median <= edit.median + FRAME_MS && paste.p95 <= VALUE_TARGET_MS;
  keep("pasteStyle", { edit, paste, handling, latency, inFirstFrame, samples: { edits, pastes } });
  print(
    report(
      `⌥⌘V against one panel edit, a card of ${PRODUCTS}, ${UNDO_RUNS} each, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "panel edit (radius typed): work", summary: edit },
        { name: "⌥⌘V: work", summary: paste, target: `median ≤ edit's + 1 frame, p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms`, met },
        { name: "⌥⌘V: (handling the key)", summary: handling },
        { name: "⌥⌘V: key to frame drawn", summary: latency },
      ],
      [`⌥⌘V: ${inFirstFrame} of ${pastes.length} shown in the desktop view, worked in, in the first frame; in every view then: ${pastes.filter((s) => s.everyViewFirstFrame).length}`],
    ),
  );
  verdict(met, "⌥⌘V shows in the next frame, its work within a frame of a panel edit's");
});

interface ParentSample {
  /** In the first frame drawn after the key, the Design panel showed the layer selected. */
  firstFrame: boolean;
  /** The main thread's time on it, as `ValueSample.work`: handling the key, then drawing that frame. */
  work: number;
  /** From the key press to that frame drawn. */
  latency: number;
}

/**
 * Escape, selecting the layer around the one selected, measured as
 * `armUndoRedo` measures ⌘Z: the Design panel shows the layer selected in the
 * first frame after it when its contents are other than before then.
 */
function armSelectParent() {
  const w = window as unknown as WithKeysFirst & { htSelectParent: Promise<ParentSample> };
  const { scheduler } = window as unknown as WithScheduler;
  const panel = document.querySelector("human-touch")!.shadowRoot!.querySelector('[aria-label="Design"]')!;
  const before = panel.innerHTML;
  return new Promise<void>((armed) =>
    requestAnimationFrame(() =>
      scheduler.postTask(
        () => {
          w.htSelectParent = new Promise((resolve) => {
            let start = 0;
            let arrived = 0;
            let handled = 0;
            const frame = () => {
              const at = performance.now();
              scheduler.postTask(
                () => {
                  const drawn = performance.now();
                  resolve({ firstFrame: panel.innerHTML !== before, work: (handled || at) - start + (drawn - at), latency: drawn - arrived });
                },
                { priority: "user-blocking" },
              );
            };
            w.htKeyFirst = (event) => {
              if (event.key !== "Escape") return;
              w.htKeyFirst = undefined;
              start = performance.now();
              arrived = event.timeStamp;
              requestAnimationFrame(frame);
            };
            const onHandled = (event: KeyboardEvent) => {
              if (event.key !== "Escape") return;
              handled = performance.now();
              removeEventListener("keydown", onHandled, true);
            };
            addEventListener("keydown", onHandled, true);
          });
          armed();
        },
        { priority: "user-blocking" },
      ),
    ),
  );
}

/**
 * Ticket 119: a layer selected reads the Variables its code writes its values
 * with, for the panel to show. Each of 20 cards of 96, a card not selected
 * before (nothing read of it yet), selected from its body with Escape: shown
 * in the Design panel in the next frame, its work within two frames.
 */
test("selecting one of 96 cards shows it in the Design panel in the next frame, its work within two frames", async ({ page }) => {
  await page.addInitScript(hearKeysFirst);
  const elements = await openBigPage(page);
  await enterEditMode(page);
  const samples: ParentSample[] = [];
  for (let i = 0; i < 20; i++) {
    // At 813px tall, the later cards are below the window's bottom (ticket 124).
    await bringCardIntoSight(page, 10 + i);
    await selectCard(page, 10 + i);
    await settle(page, 150);
    await page.evaluate(armSelectParent);
    await page.keyboard.press("Escape");
    samples.push(await page.evaluate(() => (window as unknown as { htSelectParent: Promise<ParentSample> }).htSelectParent));
    await settle(page, 150);
  }
  const work = summarize(samples.map((s) => s.work));
  const latency = summarize(samples.map((s) => s.latency));
  const inFirstFrame = samples.filter((s) => s.firstFrame).length;
  const met = inFirstFrame === samples.length && work.p95 <= VALUE_TARGET_MS;
  keep("selectCard", { work, latency, inFirstFrame, samples });
  print(
    report(
      `Selecting a card of ${PRODUCTS} with Escape, ${samples.length} cards, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "select: work", summary: work, target: `p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms`, met },
        { name: "select: key to frame drawn", summary: latency },
      ],
      [`${inFirstFrame} of ${samples.length} shown in the Design panel in the first frame`],
    ),
  );
  verdict(met, "a card selected shows in the Design panel in the next frame, its work within two frames");
});

/** How many rows the Layers panel lists. */
function layerRows(page: Page) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("treeitem").count();
}

/** Whether the views on the stage all show whole in the viewport, and how tall the stage and the viewport are, in page px. */
function stageInSight(page: Page) {
  return host(page)
    .locator(".ht-stage")
    .evaluate((stage) => {
      const [s, v] = [stage.getBoundingClientRect(), stage.parentElement!.getBoundingClientRect()];
      return { inSight: s.left >= v.left && s.top >= v.top && s.right <= v.right && s.bottom <= v.bottom, stageHeight: s.height, viewportHeight: v.height };
    });
}

/**
 * Ticket 71: changes that are not the camera's, after which the views were
 * drawn whole (ticket 22): the views beside the desktop view deleted, then
 * the page's main column deleted, so the desktop view is short enough to show
 * whole, then the delete undone with ⌘Z. The camera never moves. The view is long
 * again, mostly out of sight, but was drawn whole, and went on being drawn
 * whole, till the camera next moved: about 100ms after such changes, it is
 * drawn only as far as it shows again. Measured as the value changed above,
 * the Stack gap of a card, in the desktop view, the only one left.
 *
 * With the Layers panel shown (ticket 74): the delete undone, the column's
 * layers are listed open and closed as they were before it, some 160 rows,
 * not every layer in it, some 5200, each of which adds to every step drawn.
 */
test("after the views beside are deleted and the page's main column deleted and the delete undone, a value changed shows in the next frame, its work within two frames", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  const views = [VIEWS[0]];
  for (const name of ["Tablet", "Phone"]) await page.getByRole("button", { name: `Delete ${name} view` }).click();
  await expect(host(page).locator("iframe.ht-canvas")).toHaveCount(1);
  await settle(page, 500);
  // From a card's body up to the main column: the body, the card, the cards' grid, their section, the column.
  await selectCard(page, 6);
  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  await settle(page);
  const rowsBefore = await layerRows(page);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await stageInSight(page)).inSight, { message: "with its main column deleted, the desktop view shows whole" }).toBe(true);
  await settle(page, 500);
  const short = await stageInSight(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await stageInSight(page)).inSight, { message: "the delete undone, it is mostly out of sight" }).toBe(false);
  await settle(page, 500);
  const long = await stageInSight(page);
  const rowsUndone = await layerRows(page);
  await selectCard(page, 6);
  const rows = await layerRows(page);
  const gap = await stepValue(page, "Gap", cardBody(6), "row-gap", views);

  const name = "Stack gap (layout)";
  const work = summarize(gap.map((s) => s.work));
  const latency = summarize(gap.map((s) => s.latency));
  const inFirstFrame = gap.filter((s) => s.firstFrame).length;
  const met = inFirstFrame === gap.length && work.p95 <= VALUE_TARGET_MS;
  keep("valueAfterChanges", { [name]: { work, latency, inFirstFrame }, stageHeights: { short: short.stageHeight, long: long.stageHeight, viewport: long.viewportHeight }, layerRows: { before: rowsBefore, undone: rowsUndone, measured: rows } });
  print(
    report(
      `Changing a value after the views beside are deleted and the main column deleted and the delete undone, ${elements} elements, ${views.length} view — ${mode}`,
      [
        { name: `${name}: work`, summary: work, target: `p95 ≤ ${VALUE_TARGET_MS.toFixed(1)}ms, in the first frame`, met },
        { name: `${name}: key to frame drawn`, summary: latency },
      ],
      [
        `The desktop view ${short.stageHeight.toFixed(0)}px tall on screen without its main column, in a viewport ${long.viewportHeight.toFixed(0)}px tall; ${long.stageHeight.toFixed(0)}px once the delete is undone.`,
        `${inFirstFrame} of ${gap.length} steps shown in the desktop view in the first frame.`,
        `The Layers panel ${rowsBefore} rows before the delete, ${rowsUndone} once it is undone, ${rows} with the card's body selected.`,
      ],
    ),
  );
  verdict(met, "after changes that are not the camera's, a value changed shows in the next frame, its work within two frames");
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
  const records: DragRecord[] = [];
  for (let i = 0; i < DRAGS; i++) {
    const record = await dragCard(page, 6);
    expect(record.withLine, "the drag shows where the card would go").toBeGreaterThan(0);
    records.push(record);
  }
  const { fps, frames, moves, long, dropped, count, met, rows, note } = dragFrames(records);
  keep("drag", { fps, frameIntervals: frames, dropped, frames: count, longTasks: long, pointerMovesPerSecond: moves });
  print(report(`Dragging a card, ${elements} elements, ${VIEWS.length} views — ${mode}`, rows("drag"), [note]));
  verdict(met, "dragging keeps 60fps");
});

test("dragging a layer's handle keeps 60fps", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await selectCard(page, 6, { parent: true });
  const width = () => canvas(page).locator(card(6)).evaluate((el) => el.getBoundingClientRect().width);
  const before = await width();
  const records: DragRecord[] = [];
  for (let i = 0; i < DRAGS; i++) {
    const record = await resizeCard(page);
    expect(record.withLine, "the resize shows the card's size").toBeGreaterThan(0);
    // Esc took it back: the next resize starts from the same card.
    expect(await width(), "Esc puts the card back as it was").toBe(before);
    records.push(record);
  }
  // As a drag (ticket 22).
  const { fps, frames, moves, long, dropped, count, met, rows, note } = dragFrames(records);
  keep("resize", { fps, frameIntervals: frames, dropped, frames: count, longTasks: long, pointerMovesPerSecond: moves });
  print(report(`Resizing a card by its corner, every instance with it, ${elements} elements, ${VIEWS.length} views — ${mode}`, rows("resize"), [note]));
  verdict(met, "resizing by a handle keeps 60fps");
});

/** How many briefs `withBriefs` writes: ticket 121's standard, 20 cards beside the views. */
const BRIEFS = 20;

/**
 * Writes `BRIEFS` briefs with the Brief tool (ticket 121), each on its card
 * beside the desktop view: on the deepest layers (⌘ held) of the page's
 * headings, words, buttons and sections in sight, one brief to a layer (the
 * product cards are one usage, all of them one layer), till there are as many
 * cards; then puts the tool down, and enters edit mode again.
 */
async function withBriefs(page: Page) {
  // Every view in sight, the whole page with it: most of its elements are of the same few looped usages.
  await page.keyboard.press("Shift+1");
  await settle(page, 300);
  await page.keyboard.press("b");
  const viewport = (await host(page).getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  const cards = host(page).locator(".ht-brief-card");
  const frame = page.locator('iframe[title="Canvas"]');
  let written = 0;
  /** The elements clicked so far, by their place among those read. */
  const tried = new Set<number>();
  for (let tries = 0, pans = 0; written < BRIEFS && tries < 600 && pans < 20; tries++) {
    // Where the page's headings, words, buttons and sections are on screen, read afresh: a card opened may have brought the canvas round.
    const view = (await frame.boundingBox())!;
    const zoom = view.width / (await frame.evaluate((el: HTMLIFrameElement) => el.offsetWidth));
    const points = await canvas(page)
      .locator("body")
      .evaluate((body) =>
        [...body.querySelectorAll("h1, h2, h3, p, button, img, header, nav, aside, section, footer")].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + Math.min(r.width / 2, 6), y: r.y + Math.min(r.height / 2, 6), big: r.width >= 4 && r.height >= 4 };
        }),
      );
    let next = -1;
    for (const [i, p] of points.entries()) {
      const at = { x: view.x + p.x * zoom, y: view.y + p.y * zoom };
      if (!p.big || tried.has(i) || !inViewport(viewport, at)) continue;
      // Not under the selection toolbar or a brief card floating over the canvas (ticket 124): left for later, not tried, as they move with the selection and the canvas.
      if (await coveringAt(page, at)) continue;
      next = i;
      break;
    }
    if (next < 0) {
      // None left in sight: the canvas panned down a screen.
      pans++;
      await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
      await page.mouse.wheel(0, viewport.height * 0.8);
      await settle(page, 200);
      continue;
    }
    tried.add(next);
    const at = { x: view.x + points[next].x * zoom, y: view.y + points[next].y * zoom };
    // As `selectDeepestIn` does: a control come over the point since fails here, saying what, not as the Brief field not coming.
    await expectCanvasAt(page, at);
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.click(at.x, at.y);
    await page.keyboard.up("ControlOrMeta");
    const field = host(page).getByRole("textbox", { name: "Brief" });
    await expect(field).toBeFocused();
    // A layer with a brief already opens its card: left as it was.
    if (await field.inputValue()) {
      await page.keyboard.press("Escape");
      continue;
    }
    written++;
    await page.keyboard.type(`Brief ${written}: a little more room around it`);
    await page.keyboard.press("Enter");
    await expect(cards).toHaveCount(written);
  }
  await page.keyboard.press("Escape");
  await expect(cards).toHaveCount(BRIEFS);
  // Back to preview mode and in again: the canvas where the other drags start it, the cards back with the round.
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await settle(page, 600);
  await enterEditMode(page);
  await expect(cards).toHaveCount(BRIEFS);
}

/** Zooms the canvas in and out with the wheel, ⌘ (Ctrl) held, about the middle of the viewport for `DRAG_MS`, recording the frames, as `dragFor` does a drag. */
async function zoomFor(page: Page) {
  const viewport = (await host(page).getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  const at = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.evaluate(armFrames, ".ht-brief-card");
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
      // In for half of every 1.25s, out for the other half.
      const deltaY = Math.sin((elapsed / 1250) * 2 * Math.PI) > 0 ? -4 : 4;
      sent.push(cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY, modifiers: 2 }));
    }, POINTER_EVERY_MS);
  });
  await Promise.all(sent);
  await cdp.detach();
  const record = await page.evaluate(() => {
    const record = (window as unknown as { htFrames: FrameRecord }).htFrames;
    record.stop();
    return { times: record.times, withLine: record.withLine, long: record.long, moves: record.moves };
  });
  await settle(page);
  return record;
}

test("with 20 briefs on cards beside the views, dragging a layer and zooming the canvas keep 60fps", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  await withBriefs(page);
  await selectCard(page, 6, { parent: true });
  const drags: DragRecord[] = [];
  for (let i = 0; i < DRAGS; i++) {
    const record = await dragCard(page, 6);
    expect(record.withLine, "the drag shows where the card would go").toBeGreaterThan(0);
    drags.push(record);
  }
  const zooms: DragRecord[] = [];
  for (let i = 0; i < DRAGS; i++) {
    const record = await zoomFor(page);
    expect(record.withLine, "the cards show as the canvas zooms").toBeGreaterThan(0);
    zooms.push(record);
  }
  const drag = dragFrames(drags);
  const zoom = dragFrames(zooms);
  keep("drag with briefs", { fps: drag.fps, frameIntervals: drag.frames, dropped: drag.dropped, frames: drag.count, longTasks: drag.long, pointerMovesPerSecond: drag.moves });
  keep("zoom with briefs", { fps: zoom.fps, frameIntervals: zoom.frames, dropped: zoom.dropped, frames: zoom.count, longTasks: zoom.long, wheelEventsPerSecond: zoom.moves });
  print(report(`Dragging a card, ${BRIEFS} briefs on cards, ${elements} elements, ${VIEWS.length} views — ${mode}`, drag.rows("drag"), [drag.note]));
  print(report(`Zooming the canvas with the wheel, ${BRIEFS} briefs on cards, ${elements} elements, ${VIEWS.length} views — ${mode}`, zoom.rows("zoom"), [zoom.note]));
  verdict(drag.met && zoom.met, "with 20 briefs, dragging and zooming keep 60fps");
});

/** The free boxes added for selecting: `BOX_COLUMNS` across, `BOX_ROWS` down, 60 × 30, 12px apart. */
const BOX_COLUMNS = 3;
const BOX_ROWS = 4;
/** Runs of selecting them all, one by one, after one to warm up. */
const SELECT_RUNS = 4;

interface SelectSample {
  /** The main thread's time on it: handling the press and the click, then drawing the frame that shows the selection. */
  work: number;
  /** From the press to that frame drawn. */
  latency: number;
}

/**
 * A row of the Layers panel clicked with ⇧ held, adding its layer to those
 * selected: the main thread's time handling the press, the release and the
 * click, each from its first listener at the window to its last, plus the
 * frame that first shows `count` rows selected and the Design panel's ⇧A
 * button (Make Stack, or Make Grid where ⇧A makes one, ticket 110's
 * follow-up), from its first callback to being drawn.
 */
function armSelect(count: number) {
  const w = window as unknown as { htSelect: Promise<SelectSample> };
  const { scheduler } = window as unknown as WithScheduler;
  w.htSelect = new Promise((resolve) => {
    const root = document.querySelector("human-touch")!.shadowRoot!;
    const shown = () =>
      root.querySelectorAll('[role=tree][aria-label=Layers] [role=treeitem][aria-selected=true]').length === count &&
      !!root.querySelector('[aria-label="Make Stack"], [aria-label="Make Grid"]');
    let start = 0;
    let handling = 0;
    let began = 0;
    const capture = () => void (began = performance.now());
    const bubble = () => void (handling += performance.now() - began);
    const kinds = ["pointerdown", "pointerup", "click"];
    const onDown = () => {
      start = performance.now();
      removeEventListener("pointerdown", onDown, true);
      const frame = () => {
        const at = performance.now();
        scheduler.postTask(() => {
          const drawn = performance.now();
          if (!shown() && drawn - start < 2000) return requestAnimationFrame(frame);
          for (const kind of kinds) {
            removeEventListener(kind, capture, true);
            removeEventListener(kind, bubble);
          }
          resolve({ work: handling + (drawn - at), latency: drawn - start });
        }, { priority: "user-blocking" });
      };
      requestAnimationFrame(frame);
    };
    addEventListener("pointerdown", onDown, true);
    for (const kind of kinds) {
      addEventListener(kind, capture, true);
      addEventListener(kind, bubble);
    }
  });
}

test("selecting free layers in rows and columns one by one with ⇧ held, the panel saying what ⇧A makes of them: the work of each, for comparing (ticket 110's follow-up)", async ({ page }) => {
  const elements = await openBigPage(page);
  // A Frame of free boxes, at the top of the page, in rows and columns.
  await page.evaluate(({ columns, rows }) => {
    const board = Object.assign(document.createElement("div"), { id: "ht-boxes" });
    board.style.cssText = `position: relative; height: ${rows * 42 + 20}px`;
    for (let i = 0; i < columns * rows; i++) {
      const box = document.createElement("div");
      box.style.cssText = `position: absolute; left: ${10 + (i % columns) * 72}px; top: ${10 + Math.floor(i / columns) * 42}px; width: 60px; height: 30px; background: #ccc`;
      board.append(box);
    }
    document.body.prepend(board);
  }, { columns: BOX_COLUMNS, rows: BOX_ROWS });
  await enterEditMode(page);
  const total = BOX_COLUMNS * BOX_ROWS;
  const tree = page.getByRole("tree", { name: "Layers" });
  const first = (await canvas(page).locator("#ht-boxes > div").first().boundingBox())!;
  await selectDeepestIn(page, first);
  await settle(page);
  // The boxes' rows, as the panel lists them: the selected one and the siblings after it.
  const boxRows = tree.getByRole("treeitem").filter({ hasText: /^Frame$/ });
  const firstRow = await boxRows.evaluateAll((els) => els.findIndex((el) => el.getAttribute("aria-selected") === "true"));
  expect(firstRow).toBeGreaterThanOrEqual(0);
  const samples: SelectSample[] = [];
  for (let run = 0; run <= SELECT_RUNS; run++) {
    await boxRows.nth(firstRow).click();
    await settle(page, 150);
    for (let n = 2; n <= total; n++) {
      await page.evaluate(armSelect, n);
      await boxRows.nth(firstRow + n - 1).click({ modifiers: ["Shift"] });
      const sample = await page.evaluate(() => (window as unknown as { htSelect: Promise<SelectSample> }).htSelect);
      if (run > 0) samples.push(sample);
      await settle(page, 100);
    }
  }
  const made = await design(page).getByRole("button", { name: /^Make (Stack|Grid)$/ }).getAttribute("aria-label");
  const work = summarize(samples.map((s) => s.work));
  const latency = summarize(samples.map((s) => s.latency));
  keep("selectFree", { boxes: total, work, latency, made, samples });
  print(
    report(
      `Selecting ${total} free boxes in ${BOX_ROWS} rows of ${BOX_COLUMNS}, one by one with ⇧ held, ${SELECT_RUNS} runs, ${elements} elements, ${VIEWS.length} views — ${mode}`,
      [
        { name: "⇧-click: work", summary: work },
        { name: "⇧-click: press to frame drawn", summary: latency },
      ],
      [`All ${total} selected, the Design panel's button: ${made}. For comparing before and after only: no target is set for selecting.`],
    ),
  );
});

/** Long tasks, and the measures named `measure`, seen on the page since `armTasks`: stopped and taken by `takenTasks`. */
interface Seen {
  long: { start: number; duration: number }[];
  measures: { start: number; duration: number }[];
}
function armTasks(measure: string) {
  const w = window as unknown as { htSeen: Seen; htStop: () => void };
  const seen: Seen = { long: [], measures: [] };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "longtask") seen.long.push({ start: entry.startTime, duration: entry.duration });
      else if (entry.name === measure) seen.measures.push({ start: entry.startTime, duration: entry.duration });
    }
  });
  observer.observe({ type: "longtask" });
  observer.observe({ type: "measure" });
  w.htSeen = seen;
  w.htStop = () => observer.disconnect();
}
function takenTasks(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const w = window as unknown as { htSeen: Seen; htStop: () => void };
    w.htStop();
    return w.htSeen;
  });
}

/** The long tasks that are `own` work's: those that would not be long without the stretches of it in them. */
function longTasksOf(long: Seen["long"], own: { start: number; end: number; duration: number }[]) {
  return long.filter((task) => {
    const inIt = own.filter((s) => s.start >= task.start && s.end <= task.start + task.duration + 1).reduce((sum, s) => sum + s.duration, 0);
    return inIt > 0 && task.duration - inIt < 50;
  });
}

/**
 * docs/goals.md, Robust: while the Agent applies a round, the page checks the
 * changes not shown yet each time the code changes (ticket 64), and that must
 * never make a long task on a page of about 5000 elements. Three changes to
 * the 96 product cards (two to the card, one to its body's Stack, every check
 * reading all 96 of them, at the page's width and at the tablet's and the
 * phone's on copies of the page), then four hot updates to the cards' code:
 * one that applies none of them, then one per change. Each stretch of
 * checking is a `humantouch:check` measure; a long task is the check's when
 * it would not be one without the checking in it. For reference, the same
 * hot updates with no round claimed: the page's own long tasks. The claim is
 * measured too: the page looks at every change, and makes its copies; and
 * with the first hot update, `done` for all three, which the page answers as
 * the code comes in.
 */
/**
 * The large page with its first product card written apart from the loop, a
 * usage of the card of its own (`yes`), or as it was: so a change to that card
 * is for one usage alone, and the loop's 95 cards are another usage of it
 * (tickets 77, 82). Resolves once the dev server serves it so.
 */
async function firstCardApart(yes: boolean) {
  const BIG = fileURLToPath(new URL("../../examples/vite-react18-tw3/src/big/BigPage.tsx", import.meta.url));
  const LOOP = "{Array.from({ length: PRODUCTS }, (_, i) => (\n                <ProductCard key={i} index={i} />\n              ))}";
  const big = readFileSync(BIG, "utf8").replace(LOOP.replace("{Array.from({ length: PRODUCTS }", "<ProductCard index={0} />\n              {Array.from({ length: PRODUCTS - 1 }").replace("index={i}", "index={i + 1}"), LOOP);
  expect(big).toContain(LOOP);
  writeFileSync(BIG, yes ? big.replace(LOOP, LOOP.replace("{Array.from({ length: PRODUCTS }", "<ProductCard index={0} />\n              {Array.from({ length: PRODUCTS - 1 }").replace("index={i}", "index={i + 1}")) : big);
  await expect.poll(async () => (await (await fetch(new URL("/src/big/BigPage.tsx", BIG_URL))).text()).includes("PRODUCTS - 1")).toBe(yes);
}

test.describe("a claimed round", () => {
  test.use({ keepRoundInMemory: false });
  const REACT18 = fileURLToPath(new URL("../../examples/vite-react18-tw3/", import.meta.url));
  const PARTS = `${REACT18}src/big/parts.tsx`;
  const HUMAN_TOUCH_FOLDER = `${REACT18}.humantouch`;
  const CLI = fileURLToPath(new URL("../../packages/humantouch/dist/cli.js", import.meta.url));
  const original = readFileSync(PARTS, "utf8");
  const npxHumanTouch = async (...args: string[]) => (await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: REACT18 })).stdout;
  const served = async () => (await (await fetch(new URL("/src/big/parts.tsx", BIG_URL))).text()).includes("Made in small batches");
  test.beforeEach(() => rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true }));
  test.afterEach(async () => {
    writeFileSync(PARTS, original);
    rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true });
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

  const CHECKS = "humantouch:check";

  /**
   * Makes each hot update in turn, waits till the page shows it and has
   * settled; what was seen meanwhile, per update. `asking`: with the first,
   * the Agent runs `done` for every change, which the page answers as the code comes in.
   */
  async function hotUpdates(page: Page, asking?: () => Promise<unknown>, updates: typeof UPDATES = UPDATES) {
    const per: { name: string; long: Seen["long"]; checks: Seen["measures"] }[] = [];
    for (const [i, { name, from, to, shows }] of updates.entries()) {
      await page.evaluate(armTasks, CHECKS);
      const text = readFileSync(PARTS, "utf8");
      expect(text).toContain(from);
      writeFileSync(PARTS, text.replace(from, to));
      const asked = i === 0 ? asking?.() : undefined;
      await expect.poll(() => page.evaluate(shows), { timeout: 20_000 }).toBe(true);
      await asked;
      await settle(page, 2000);
      const seen = await takenTasks(page);
      per.push({ name, long: seen.long, checks: seen.measures.filter((entry) => entry.duration >= 0) });
    }
    return per;
  }

  /** Looks run back to back, one task each: a stretch of checking. */
  function stretches(checks: Seen["measures"]) {
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
      const box = (await fieldOf(page, field));
      await box.fill(value);
      await box.press("Enter");
    }
    await selectCard(page, 6);
    const gap = (await fieldOf(page, "Gap"));
    await gap.fill("10");
    await gap.press("Enter");
    await expect.poll(() => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes.length : 0)).toBe(3);
    // The claim too: the page looks at every change once, and makes its copies at the views' widths.
    await page.evaluate(armTasks, CHECKS);
    await npxHumanTouch("claim");
    const ring = page.getByRole("progressbar", { name: "Applying design changes" });
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await settle(page, 2000);
    const { long: atClaimLong, measures: atClaimChecks } = await takenTasks(page);

    let answered = "";
    const claimed = [{ name: "claim", long: atClaimLong, checks: atClaimChecks }, ...(await hotUpdates(page, async () => (answered = await npxHumanTouch("done", "1", "2", "3"))))];
    // None applied by that first update: done waited for it, and says so for each.
    expect(answered).toContain("Changes 1, 2 and 3 done: 0 of 3 changes applied.");
    await expect(ring).toHaveAttribute("aria-valuenow", "3");
    await npxHumanTouch("finish");
    await expect(ring).toHaveCount(0);

    // The same hot updates with no round claimed: the page's own long tasks.
    writeFileSync(PARTS, original);
    await expect.poll(served).toBe(true);
    await openBigPage(page);
    const unclaimed = await hotUpdates(page);
    reportChecks(claimed, unclaimed, elements, "claimedChecks", "3 changes to 96 cards");
  });

  /**
   * Ticket 104: the same three changes made in the phone view, at its
   * breakpoint (below 560px, the example's `sm`): the page looks at them on a
   * copy of the page in the range, and, as wide as its window and the tablet view,
   * at the cards' values noted as the round was claimed.
   */
  test("while a round of changes at the phone's breakpoint is claimed, the page checks them, and the widths outside their range, on each hot update with no long task of its own", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    const phone = page.locator('iframe[title="Phone 390"]').contentFrame();
    const pickInPhone = async (parent: boolean) => {
      await selectDeepestIn(page, (await phone.locator(cardBody(1)).boundingBox())!);
      if (parent) await page.keyboard.press("Escape");
      await settle(page);
    };
    await pickInPhone(true);
    for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
      const box = (await fieldOf(page, field));
      await box.fill(value);
      await box.press("Enter");
    }
    await pickInPhone(false);
    const gap = (await fieldOf(page, "Gap"));
    await gap.fill("10");
    await gap.press("Enter");
    const saved = () => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes : []) as { breakpoint?: object; parts?: unknown[] }[];
    // The example's own `sm` is 560px: the phone's range (below 560px) is one part, with none to read.
    await expect.poll(() => saved().map((change) => !!change.breakpoint), { timeout: 20_000 }).toEqual([true, true, true]);
    await page.evaluate(armTasks, CHECKS);
    await npxHumanTouch("claim");
    const ring = page.getByRole("progressbar", { name: "Applying design changes" });
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await settle(page, 2000);
    const { long: atClaimLong, measures: atClaimChecks } = await takenTasks(page);
    const claimed = [{ name: "claim", long: atClaimLong, checks: atClaimChecks }, ...(await hotUpdates(page, () => npxHumanTouch("done", "1", "2", "3")))];
    await npxHumanTouch("finish");
    await expect(ring).toHaveCount(0);

    writeFileSync(PARTS, original);
    await expect.poll(served).toBe(true);
    await openBigPage(page);
    const unclaimed = await hotUpdates(page);
    reportChecks(claimed, unclaimed, elements, "claimedChecksAtBreakpoint", "3 changes at the phone's breakpoint to 96 cards");
  });

  /**
   * Ticket 76: text drawn in the body of a card, so in each of the 96 cards,
   * its size then changed. Each check finds the new text where its change puts
   * it, in all 96 bodies, before it reads its size. Hot updates: the cards'
   * words (neither applied), the text written into the cards' code, its size.
   */
  test("while a round with a layer made in it is claimed, the page finds the layer on each hot update with no long task of its own", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    const body = (await canvas(page).locator(`${cardBody(6)} > p`).boundingBox())!;
    await page.keyboard.press("t");
    await page.mouse.move(body.x + 10, body.y + body.height - 2);
    await page.mouse.down();
    await page.mouse.move(body.x + 120, body.y + body.height + 8, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.type("Ships in a day");
    await page.keyboard.press("Escape");
    // The new text, selected.
    const size = (await fieldOf(page, "Font size"));
    await size.fill("20");
    await size.press("Enter");
    const saved = () => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes : []);
    await expect.poll(() => saved().map((change: { kind: string; property: string }) => `${change.kind} ${change.property}`)).toEqual(["create new", "style fontSize"]);
    await page.evaluate(armTasks, CHECKS);
    await npxHumanTouch("claim");
    const ring = page.getByRole("progressbar", { name: "Applying design changes" });
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await settle(page, 2000);
    const { long: atClaimLong, measures: atClaimChecks } = await takenTasks(page);
    const PARAGRAPH = '<p className="text-caption text-muted">Made in small batches, finished by hand, and shipped in recycled packaging.</p>';
    const updates: typeof UPDATES = [
      { name: "neither applied", from: "Made in small batches", to: "Made in small lots", shows: () => document.querySelector("[data-testid=product] p")!.textContent!.includes("small lots") },
      { name: "the text written in every card", from: PARAGRAPH.replace("batches", "lots"), to: `${PARAGRAPH.replace("batches", "lots")}\n        <p className="text-caption">Ships in a day</p>`, shows: () => [...document.querySelectorAll("[data-testid=product] p + p")].length === 96 },
      { name: "its size applied", from: '<p className="text-caption">Ships in a day</p>', to: '<p className="text-[20px]">Ships in a day</p>', shows: () => [...document.querySelectorAll("[data-testid=product] p + p")].every((p) => getComputedStyle(p).fontSize === "20px") },
    ];
    const claimed = [{ name: "claim", long: atClaimLong, checks: atClaimChecks }, ...(await hotUpdates(page, undefined, updates))];
    await expect(ring).toHaveAttribute("aria-valuenow", "2");
    await npxHumanTouch("finish");
    await expect(ring).toHaveCount(0);

    writeFileSync(PARTS, original);
    await expect.poll(served).toBe(true);
    await openBigPage(page);
    const unclaimed = await hotUpdates(page, undefined, updates);
    reportChecks(claimed, unclaimed, elements, "claimedChecksMade", "new text in the 96 cards, and its size");
  });

  /**
   * Ticket 77: the same three changes, made on a usage of the product card of
   * its own (the first card, written apart from the loop for this test), so
   * the page also notes, as the round is claimed, what the loop's 95 cards,
   * the card's other usage, show of each change's property, and looks at them
   * again on each hot update. The hot updates write the changes into the card
   * itself, so the other 95 change too: the most there is to look at.
   */
  test("while a round with a change for one usage is claimed, the page looks at the component's other usages on each hot update with no long task of its own", async ({ page }) => {
    try {
      await firstCardApart(true);
      const elements = await openBigPage(page);
      await enterEditMode(page);
      await selectCard(page, 1, { parent: true });
      for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
        const box = (await fieldOf(page, field));
        await box.fill(value);
        await box.press("Enter");
      }
      await selectCard(page, 1);
      const gap = (await fieldOf(page, "Gap"));
      await gap.fill("10");
      await gap.press("Enter");
      const saved = () => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes : []);
      await expect.poll(() => saved().length).toBe(3);
      // One usage of the card, with one instance; the loop's 95 its other usage.
      expect(saved().map((change: { scope: string; target: { instances: number } }) => `${change.scope} ${change.target.instances}`)).toEqual(["usage 1", "usage 1", "usage 1"]);
      await page.evaluate(armTasks, CHECKS);
      await npxHumanTouch("claim");
      const ring = page.getByRole("progressbar", { name: "Applying design changes" });
      await expect(ring).toHaveAttribute("aria-valuenow", "0");
      await settle(page, 2000);
      const { long: atClaimLong, measures: atClaimChecks } = await takenTasks(page);
      let answered = "";
      const claimed = [{ name: "claim", long: atClaimLong, checks: atClaimChecks }, ...(await hotUpdates(page, async () => (answered = await npxHumanTouch("done", "1", "2", "3"))))];
      expect(answered).toContain("Changes 1, 2 and 3 done: 0 of 3 changes applied.");
      const ringAtEnd = await ring.getAttribute("aria-valuenow");
      await npxHumanTouch("finish");
      await expect(ring).toHaveCount(0);
      console.log(`ticket 77, other usages: the ring at the end ${ringAtEnd} of 3`);

      writeFileSync(PARTS, original);
      await expect.poll(served).toBe(true);
      await openBigPage(page);
      const unclaimed = await hotUpdates(page);
      reportChecks(claimed, unclaimed, elements, "claimedChecksUsages", "3 changes to a card's own usage, 95 cards of another");
    } finally {
      await firstCardApart(false);
    }
  });

  /**
   * Ticket 82: the same round, claimed, then the page reloaded. What the page
   * noted of the 95 cards of the other usage at the claim is kept in
   * `.humantouch/` and comes with the round: the reloaded page finds those cards
   * again by their usage, rather than noting them afresh (before 82). The
   * reload's own checking, from the page's first script on, then the same hot
   * updates as above.
   */
  test("a round with a change for one usage claimed, the page reloaded: it goes by what was kept, and looks at the other usages on each hot update with no long task of its own", async ({ page }) => {
    try {
      await firstCardApart(true);
      const elements = await openBigPage(page);
      await enterEditMode(page);
      await selectCard(page, 1, { parent: true });
      for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
        const box = (await fieldOf(page, field));
        await box.fill(value);
        await box.press("Enter");
      }
      await selectCard(page, 1);
      const gap = (await fieldOf(page, "Gap"));
      await gap.fill("10");
      await gap.press("Enter");
      const saved = () => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes : []);
      await expect.poll(() => saved().length).toBe(3);
      await npxHumanTouch("claim");
      const ring = page.getByRole("progressbar", { name: "Applying design changes" });
      await expect(ring).toHaveAttribute("aria-valuenow", "0");
      await settle(page, 2000);
      // From the reloaded page's first script on.
      await page.addInitScript(armTasks, CHECKS);
      await page.reload();
      await expect(page.locator("[data-testid=product]")).toHaveCount(PRODUCTS);
      await expect(ring).toHaveAttribute("aria-valuenow", "0");
      await settle(page, 2000);
      const { long: atReloadLong, measures: atReloadChecks } = await takenTasks(page);
      // The file holds the notes with the claim they belong to (after the line's review); before that, the notes alone.
      const file = existsSync(`${HUMAN_TOUCH_FOLDER}/other-usages.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/other-usages.json`, "utf8")) : {};
      const kept = Object.keys(file.otherUsages ?? file).length;
      let answered = "";
      const claimed = [{ name: "reload", long: atReloadLong, checks: atReloadChecks }, ...(await hotUpdates(page, async () => (answered = await npxHumanTouch("done", "1", "2", "3"))))];
      expect(answered).toContain("Changes 1, 2 and 3 done: 0 of 3 changes applied.");
      const ringAtEnd = await ring.getAttribute("aria-valuenow");
      await npxHumanTouch("finish");
      await expect(ring).toHaveCount(0);
      console.log(`ticket 82, reloaded: changes noted in .humantouch/ ${kept}; the ring at the end ${ringAtEnd} of 3`);

      writeFileSync(PARTS, original);
      await expect.poll(served).toBe(true);
      await openBigPage(page);
      const unclaimed = await hotUpdates(page);
      reportChecks(claimed, unclaimed, elements, "claimedChecksReloaded", "3 changes to a card's own usage, 95 cards of another, the page reloaded once claimed");
    } finally {
      await firstCardApart(false);
    }
  });

  /** Prints and keeps what was seen of the checks of a claimed round, and says whether no long task was the check's. */
  function reportChecks(claimed: { name: string; long: Seen["long"]; checks: Seen["measures"] }[], unclaimed: { long: Seen["long"] }[], elements: number, kept: string, what: string) {
    const rows = claimed.map(({ name, long, checks }, i) => {
      const own = stretches(checks);
      // A long task the check makes: one that would not be long without the checking in it.
      const ofCheck = longTasksOf(
        long,
        own.map((s) => ({ ...s, duration: s.checking })),
      );
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
    keep(kept, { elements, rows });
    print(
      report(
        `Checking a claimed round on hot updates, ${elements} elements, ${what}, views 768 and 390 — ${mode}`,
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
    verdict(met, `checking a claimed round (${what}): longest stretch ${longest.toFixed(1)}ms, ${ofCheck.length} long tasks of its own`);
  }
});

/**
 * docs/goals.md, Robust (ticket 78): in edit mode, with the round not claimed,
 * each time the code changes the page tells whether it changed, once the code
 * has rested about a second: whether a change of the canvas now shows (the
 * Agent landing it unclaimed), then whether anything the page draws changed
 * (elements put in or taken out, attributes, text, stylesheets). That must
 * never make a long task on a page of about 5000 elements. Two changes on
 * the canvas, so the page changing is told in a toast and nothing is frozen
 * afresh; three hot updates to the cards' code: one that leaves the page as
 * it was (a type added at the top, every source marker in the file a line
 * down), one to the words of the 96 cards, and one to a class on them, new to
 * the stylesheet. Each stretch of telling is a `humantouch:page-changed`
 * measure; a long task is its own when it would not be one without it.
 */
test.describe("the code changing in edit mode, with no claim", () => {
  test.use({ keepRoundInMemory: false });
  const REACT18 = fileURLToPath(new URL("../../examples/vite-react18-tw3/", import.meta.url));
  const PARTS = `${REACT18}src/big/parts.tsx`;
  const HUMAN_TOUCH_FOLDER = `${REACT18}.humantouch`;
  const original = readFileSync(PARTS, "utf8");
  const served = async () => (await (await fetch(new URL("/src/big/parts.tsx", BIG_URL))).text()).includes("Made in small batches");
  test.beforeEach(() => rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true }));
  test.afterEach(async () => {
    writeFileSync(PARTS, original);
    rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true });
    await expect.poll(served).toBe(true);
  });

  const IMPORT = 'import { avatar, picture } from "./images";';
  const MEASURE = "humantouch:page-changed";
  const productLoc = () => document.querySelector("[data-testid=product]")!.getAttribute("data-ht-loc");

  test("in edit mode with no claim, the page tells whether it changed on each hot update with no long task of its own", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    await selectCard(page, 6, { parent: true });
    for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
      const box = (await fieldOf(page, field));
      await box.fill(value);
      await box.press("Enter");
    }
    await expect.poll(() => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes.length : 0)).toBe(2);
    await settle(page, 1000);
    const locAtStart = await page.evaluate(productLoc);
    const updates = [
      { name: "the page the same, every marker a line down", from: IMPORT, to: `${IMPORT}\ntype Unused = string;`, shows: async () => (await page.evaluate(productLoc)) !== locAtStart },
      { name: "the words of 96 cards", from: "Made in small batches", to: "Made in small lots", shows: () => page.evaluate(() => document.querySelector("[data-testid=product] p")!.textContent!.includes("small lots")) },
      {
        name: "a class on 96 cards, new to the stylesheet",
        from: "flex flex-1 flex-col gap-2 p-gutter",
        to: "flex flex-1 flex-col gap-[10px] p-gutter",
        shows: () => page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=product] > div:nth-of-type(2)")!).rowGap === "10px"),
      },
    ];
    const rows: { name: string; looks: number; longestStretch: number; telling: number; longTasks: number[]; longTasksOfTelling: number[]; told: number }[] = [];
    for (const { name, from, to, shows } of updates) {
      await page.evaluate(armTasks, MEASURE);
      const text = readFileSync(PARTS, "utf8");
      expect(text).toContain(from);
      writeFileSync(PARTS, text.replace(from, to));
      await expect.poll(shows, { timeout: 20_000 }).toBe(true);
      // The code at rest for a second, then told: and some.
      await settle(page, 3000);
      const seen = await takenTasks(page);
      const own = seen.measures.filter((entry) => entry.duration >= 0);
      rows.push({
        name,
        looks: own.length,
        longestStretch: Math.max(0, ...own.map((entry) => entry.duration)),
        telling: own.reduce((sum, entry) => sum + entry.duration, 0),
        longTasks: seen.long.map((task) => task.duration),
        longTasksOfTelling: longTasksOf(seen.long, own.map((entry) => ({ start: entry.start, end: entry.start + entry.duration, duration: entry.duration }))).map((task) => task.duration),
        told: await host(page).locator('[data-ht-notice="page-changed"]').count(),
      });
    }
    const longest = Math.max(...rows.map((row) => row.longestStretch));
    const ofTelling = rows.flatMap((row) => row.longTasksOfTelling);
    const met = ofTelling.length === 0 && longest < 50;
    keep("unclaimedCodeChanges", { elements, rows });
    print(
      report(
        `Telling whether the page changed on hot updates in edit mode, no claim, ${elements} elements, 2 changes to 96 cards — ${mode}`,
        [
          { name: "longest stretch of telling", summary: summarize(rows.map((row) => row.longestStretch)), target: "< 50ms, no long task of its own", met },
          { name: "telling per hot update", summary: summarize(rows.map((row) => row.telling)) },
        ],
        rows.map(
          (row) =>
            `${row.name}: ${row.looks} slices, the longest ${ms(row.longestStretch)}, ${ms(row.telling)} in all; long tasks ${row.longTasks.map((d) => d.toFixed(0)).join(", ") || "none"} (its own: ${row.longTasksOfTelling.length}); page-changed toast up: ${row.told}`,
        ),
      ),
    );
    verdict(met, `telling whether the page changed: longest slice ${longest.toFixed(1)}ms, ${ofTelling.length} long tasks of its own`);
  });

  test("in edit mode with no claim, two changes for a card's own usage on the canvas, the page notes the 95 cards of its other usage as each run of hot updates begins, with no long task of its own (ticket 82)", async ({ page }) => {
    await firstCardApart(true);
    try {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    await selectCard(page, 1, { parent: true });
    for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
      const box = (await fieldOf(page, field));
      await box.fill(value);
      await box.press("Enter");
    }
    await expect.poll(() => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes.length : 0)).toBe(2);
    await settle(page, 1000);
    const locAtStart = await page.evaluate(productLoc);
    const updates = [
      { name: "the page the same, every marker a line down", from: IMPORT, to: `${IMPORT}\ntype Unused = string;`, shows: async () => (await page.evaluate(productLoc)) !== locAtStart },
      { name: "the words of 96 cards", from: "Made in small batches", to: "Made in small lots", shows: () => page.evaluate(() => document.querySelector("[data-testid=product] p")!.textContent!.includes("small lots")) },
      {
        name: "a class on 96 cards, new to the stylesheet",
        from: "flex flex-1 flex-col gap-2 p-gutter",
        to: "flex flex-1 flex-col gap-[10px] p-gutter",
        shows: () => page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=product] > div:nth-of-type(2)")!).rowGap === "10px"),
      },
    ];
    const rows: { name: string; looks: number; longestStretch: number; telling: number; longTasks: number[]; longTasksOfTelling: number[]; told: number }[] = [];
    for (const { name, from, to, shows } of updates) {
      await page.evaluate(armTasks, MEASURE);
      const text = readFileSync(PARTS, "utf8");
      expect(text).toContain(from);
      writeFileSync(PARTS, text.replace(from, to));
      await expect.poll(shows, { timeout: 20_000 }).toBe(true);
      // The code at rest for a second, then told: and some.
      await settle(page, 3000);
      const seen = await takenTasks(page);
      const own = seen.measures.filter((entry) => entry.duration >= 0);
      rows.push({
        name,
        looks: own.length,
        longestStretch: Math.max(0, ...own.map((entry) => entry.duration)),
        telling: own.reduce((sum, entry) => sum + entry.duration, 0),
        longTasks: seen.long.map((task) => task.duration),
        longTasksOfTelling: longTasksOf(seen.long, own.map((entry) => ({ start: entry.start, end: entry.start + entry.duration, duration: entry.duration }))).map((task) => task.duration),
        told: await host(page).locator('[data-ht-notice="page-changed"]').count(),
      });
    }
    const longest = Math.max(...rows.map((row) => row.longestStretch));
    const ofTelling = rows.flatMap((row) => row.longTasksOfTelling);
    const met = ofTelling.length === 0 && longest < 50;
    keep("unclaimedCodeChangesUsages", { elements, rows });
    print(
      report(
        `Telling whether the page changed on hot updates in edit mode, no claim, ${elements} elements, 2 changes to a card's own usage, 95 cards of another — ${mode}`,
        [
          { name: "longest stretch of telling", summary: summarize(rows.map((row) => row.longestStretch)), target: "< 50ms, no long task of its own", met },
          { name: "telling per hot update", summary: summarize(rows.map((row) => row.telling)) },
        ],
        rows.map(
          (row) =>
            `${row.name}: ${row.looks} slices, the longest ${ms(row.longestStretch)}, ${ms(row.telling)} in all; long tasks ${row.longTasks.map((d) => d.toFixed(0)).join(", ") || "none"} (its own: ${row.longTasksOfTelling.length}); page-changed toast up: ${row.told}`,
        ),
      ),
    );
    verdict(met, `telling whether the page changed, other usages noted: longest slice ${longest.toFixed(1)}ms, ${ofTelling.length} long tasks of its own`);
      } finally {
      await firstCardApart(false);
    }
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
 * once by going back to preview mode. Each step of reading is a
 * `humantouch:parts` measure. No long task may come from the reading's first
 * step to its last, the reading's own or not: one the reading makes between
 * its steps (the browser laying the copy out, say) is counted too.
 */
test.describe("a change at a breakpoint", () => {
  test.use({ keepRoundInMemory: false });
  const HUMAN_TOUCH_FOLDER = fileURLToPath(new URL("../../examples/vite-react18-tw3/.humantouch", import.meta.url));
  test.beforeEach(() => rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true }));
  test.afterEach(() => rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true }));

  const HERO = "[data-testid=big-hero]";
  const HERO_PICTURE = `${HERO} img`;
  const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]').contentFrame();
  const changes = (): { id: number; parts?: unknown[] | null }[] => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")).changes : []);

  const PARTS_MEASURE = "humantouch:parts";

  /** Selects the deepest layer at a point just inside `selector`'s box in the tablet view: edits apply from 560px to 1119px. */
  async function selectInTablet(page: Page, selector: string) {
    await selectDeepestIn(page, (await tablet(page).locator(selector).boundingBox())!);
    await settle(page);
  }

  /** Sets `field` to `value`; with `leave`, goes back to preview mode at once. Waits till change `id` is saved with the parts of its range read; what was seen meanwhile. */
  async function changeAndRead(page: Page, id: number, field: string, value: string, leave = false) {
    await page.evaluate(armTasks, PARTS_MEASURE);
    const box = (await fieldOf(page, field));
    await box.fill(value);
    await box.press("Enter");
    if (leave) await page.getByRole("button", { name: EXIT_LABEL }).click();
    const started = Date.now();
    await expect.poll(() => changes().find((change) => change.id === id)?.parts?.length ?? 0, { timeout: 20_000 }).toBe(2);
    const saved = Date.now() - started;
    await settle(page, 1000);
    const seen = await takenTasks(page);
    const own = [...seen.measures].sort((a, b) => a.start - b.start).map((s) => ({ ...s, end: s.start + s.duration }));
    // Every long task from the first step of the reading to its last, the reading's or not: none should come.
    const whileReading = own.length ? seen.long.filter((task) => task.start + task.duration > own[0].start && task.start < own.at(-1)!.end) : [];
    return {
      name: `${field}${leave ? ", then back to preview mode at once" : ""}`,
      saved,
      steps: own.length,
      longest: Math.max(0, ...own.map((s) => s.duration)),
      reading: own.reduce((sum, s) => sum + s.duration, 0),
      longTasks: seen.long.map((task) => task.duration),
      longTasksOfReading: longTasksOf(seen.long, own).map((task) => task.duration),
      longTasksWhileReading: whileReading.map((task) => task.duration),
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
    rows.push(await changeAndRead(page, 4, "Opacity", "90", true));
    await enterEditMode(page);
    await selectInTablet(page, HERO_PICTURE);
    rows.push(await changeAndRead(page, 5, "Corner radius", "12", true));

    const longest = Math.max(...rows.map((row) => row.longest));
    const ofReading = rows.flatMap((row) => row.longTasksOfReading);
    const whileReading = rows.flatMap((row) => row.longTasksWhileReading);
    // Read every time, a step at a time.
    expect(rows.every((row) => row.steps > 0)).toBe(true);
    const met = ofReading.length === 0 && whileReading.length === 0 && longest < 50;
    keep("rangeParts", { elements, rows });
    print(
      report(
        `Reading each part of a tablet-view change's range, ${elements} elements, 2 parts (560–819px, 820–1119px) — ${mode}`,
        [
          { name: "longest step of reading", summary: summarize(rows.map((row) => row.longest)), target: "< 50ms, no long task while reading", met },
          { name: "reading per change", summary: summarize(rows.map((row) => row.reading)) },
          { name: "edit to parts saved", summary: summarize(rows.map((row) => row.saved)) },
        ],
        rows.map(
          (row) =>
            `${row.name}: ${row.steps} steps, the longest ${ms(row.longest)}, ${ms(row.reading)} in all, saved ${row.saved}ms after; long tasks ${row.longTasks.map((d) => d.toFixed(0)).join(", ") || "none"} (the reading's: ${row.longTasksOfReading.length}; from its first step to its last: ${row.longTasksWhileReading.length})`,
        ),
      ),
    );
    verdict(met, `reading the parts of a change's range: longest stretch ${longest.toFixed(1)}ms, ${ofReading.length} long tasks of its own, ${whileReading.length} while it went on`);
  });
});

/**
 * Ticket 68: edit mode comes back to the same canvas, the round saved, and
 * after a round that ended with changes not applied, carried over to the next
 * on it, what was applied taken into it as it opens. On the large page, with
 * three changes to the 96 product cards (two to the card, one to its body's
 * Stack): entering edit mode on the round saved, not claimed (as before
 * ticket 68); then, the Agent having applied the corners and the designer
 * ended the round by hand (a round the Agent finishes leaves nothing, ADR
 * 0019), on the round carried over. Each run from a page loaded afresh, the saved
 * canvas put back, and once more without a reload; the long tasks from the
 * click to every view up are counted. The canvas is never saved meanwhile:
 * each entry takes what was applied in afresh.
 */
test.describe("the same canvas again", () => {
  test.use({ keepRoundInMemory: false });
  const REACT18 = fileURLToPath(new URL("../../examples/vite-react18-tw3/", import.meta.url));
  const PARTS = `${REACT18}src/big/parts.tsx`;
  const HUMAN_TOUCH_FOLDER = `${REACT18}.humantouch`;
  const CLI = fileURLToPath(new URL("../../packages/humantouch/dist/cli.js", import.meta.url));
  const original = readFileSync(PARTS, "utf8");
  const npxHumanTouch = async (...args: string[]) => (await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: REACT18 })).stdout;
  const served = async () => (await (await fetch(new URL("/src/big/parts.tsx", BIG_URL))).text()).includes("rounded-card border");
  const CARD = `<article className="flex flex-col overflow-hidden rounded-card border border-brand-100 bg-white shadow-card" data-testid="product">`;
  const changesSaved = () => (existsSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`) ? JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}/changeset.json`, "utf8")) : null);
  test.beforeEach(() => rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true }));
  test.afterEach(async () => {
    writeFileSync(PARTS, original);
    rmSync(HUMAN_TOUCH_FOLDER, { recursive: true, force: true });
    await expect.poll(served).toBe(true);
  });

  /** Enters edit mode `ENTER_RUNS` times, each on a page loaded afresh then once more on the same page, after one to warm up: the times, and the long tasks of each. */
  async function entries(page: Page) {
    const times: number[] = [];
    const long: number[][] = [];
    for (let run = 0; run <= ENTER_RUNS; run++) {
      await openBigPage(page);
      for (const again of [false, true]) {
        if (again) {
          await page.getByRole("button", { name: EXIT_LABEL }).click();
          await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
          await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
          await settle(page, 600);
        }
        await page.evaluate(armTasks, "none");
        const entry = await enterAndMeasure(page, TOGGLE_LABEL);
        await settle(page, 600);
        const seen = await takenTasks(page);
        if (run === 0) continue;
        times.push(entry.desktopUp);
        long.push(seen.long.map((task) => task.duration));
      }
    }
    return { times, long };
  }

  test("entering edit mode on the same canvas, a round saved or carried over, takes at most 150ms", async ({ page }) => {
    const elements = await openBigPage(page);
    await enterEditMode(page);
    await selectCard(page, 6, { parent: true });
    for (const [field, value] of [["Corner radius", "20"], ["Fill color", "fafafa"]]) {
      const box = (await fieldOf(page, field));
      await box.fill(value);
      await box.press("Enter");
    }
    await selectCard(page, 6);
    const gap = (await fieldOf(page, "Gap"));
    await gap.fill("10");
    await gap.press("Enter");
    await expect.poll(() => changesSaved()?.changes.length ?? 0).toBe(3);
    await page.getByRole("button", { name: EXIT_LABEL }).click();
    await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

    const saved = await entries(page);
    expect(changesSaved()?.changes.length).toBe(3);

    // The Agent applies the corners and stops; the designer ends the round, pressing and holding the toggle: the fill and the gap are left (ticket 68, ADR 0019).
    await npxHumanTouch("claim");
    writeFileSync(PARTS, readFileSync(PARTS, "utf8").replace(CARD, CARD.replace("rounded-card", "rounded-[20px]")));
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=product]")!).borderTopLeftRadius), { timeout: 20_000 }).toBe("20px");
    await npxHumanTouch("done", "1");
    await page.getByRole("button", { name: /^Human Touch: applying design changes/ }).hover();
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
    const carriedOver = changesSaved();
    const carried = carriedOver?.applied?.length ? await entries(page) : null;
    if (carried) expect(changesSaved()).toEqual(carriedOver);

    const rows = [
      { name: "on the round saved", ...saved, summary: summarize(saved.times) },
      ...(carried ? [{ name: "on the round carried over", ...carried, summary: summarize(carried.times) }] : []),
    ];
    const met = rows.every((row) => row.summary.median <= ENTER_TARGET_MS);
    keep("sameCanvas", { elements, rows: rows.map(({ name, times, long, summary }) => ({ name, summary, samples: times, longTasks: long })) });
    print(
      report(
        `Entering edit mode on the same canvas, ${elements} elements, ${VIEWS.length} views, 3 changes to 96 cards — ${mode}`,
        rows.map(({ name, summary }) => ({ name, summary, target: `median ≤ ${ENTER_TARGET_MS}ms`, met: summary.median <= ENTER_TARGET_MS })),
        [
          ...rows.map(({ name, long }) => `${name}: long tasks per entry ${long.map((tasks) => tasks.length).join(", ")}; the longest ${Math.max(0, ...long.flat()).toFixed(0)}ms`),
          carried ? "Carried over: 2 changes left, 1 applied, taken into the canvas at each entry." : "No round carried over: this code drops the canvas once the round ends.",
        ],
      ),
    );
    verdict(met, `entering edit mode on the same canvas: medians ${rows.map((row) => row.summary.median.toFixed(1)).join(", ")}ms, target ${ENTER_TARGET_MS}ms`);
  });
});
