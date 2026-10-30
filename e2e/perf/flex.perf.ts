import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
async function everyViewShows(page: Page, selector: string, property: string, value: string, views = VIEWS) {
  for (const title of views) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator(selector)).toHaveCSS(property, value);
}

/** Steps a value up with the arrow key, `VALUE_STEPS` times, measuring each, in `views`, the first worked in. */
async function stepValue(page: Page, field: string, selector: string, property: string, views = VIEWS) {
  await design(page).getByRole("textbox", { name: field, exact: true }).focus();
  const samples: ValueSample[] = [];
  for (let i = 0; i < VALUE_STEPS; i++) {
    const expected = `${parseFloat(await valueOnCanvas(page, selector, property)) + 1}px`;
    await page.evaluate(armValue, { views, selector, property, expected });
    await page.keyboard.press("ArrowUp");
    samples.push(await page.evaluate(() => (window as unknown as { vkValue: Promise<ValueSample> }).vkValue));
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

/** Whether the views on the stage all show whole in the viewport, and how tall the stage and the viewport are, in page px. */
function stageInSight(page: Page) {
  return host(page)
    .locator(".vk-stage")
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
 */
test("after the views beside are deleted and the page's main column deleted and the delete undone, a value changed shows in the next frame, its work within two frames", async ({ page }) => {
  const elements = await openBigPage(page);
  await enterEditMode(page);
  const views = [VIEWS[0]];
  for (const name of ["Tablet", "Phone"]) await page.getByRole("button", { name: `Delete ${name} view` }).click();
  await expect(host(page).locator("iframe.vk-canvas")).toHaveCount(1);
  await settle(page, 500);
  // From a card's body up to the main column: the body, the card, the cards' grid, their section, the column.
  await selectCard(page, 6);
  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await stageInSight(page)).inSight, { message: "with its main column deleted, the desktop view shows whole" }).toBe(true);
  await settle(page, 500);
  const short = await stageInSight(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await stageInSight(page)).inSight, { message: "the delete undone, it is mostly out of sight" }).toBe(false);
  await settle(page, 500);
  const long = await stageInSight(page);
  await selectCard(page, 6);
  const gap = await stepValue(page, "Gap", cardBody(6), "row-gap", views);

  const name = "Stack gap (layout)";
  const work = summarize(gap.map((s) => s.work));
  const latency = summarize(gap.map((s) => s.latency));
  const inFirstFrame = gap.filter((s) => s.firstFrame).length;
  const met = inFirstFrame === gap.length && work.p95 <= VALUE_TARGET_MS;
  keep("valueAfterChanges", { [name]: { work, latency, inFirstFrame }, stageHeights: { short: short.stageHeight, long: long.stageHeight, viewport: long.viewportHeight } });
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
