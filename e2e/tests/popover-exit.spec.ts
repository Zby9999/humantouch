import { REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { POPOVER_EXIT_MS, TIP_DELAY_MS, TIP_GRACE_MS } from "../../packages/03kind/src/client/motion";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/** Popovers opening at once and leaving, closed with the pointer, by fading and moving down; the toolbar's tips (designer, 2026-11-08). */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** What a menu is just after it closed, read at once, in one go. */
function leavingState(menu: Locator) {
  return menu.evaluateAll((menus) =>
    menus.map((m) => ({
      leaving: m.classList.contains("is-leaving"),
      hidden: m.getAttribute("aria-hidden"),
      inert: (m as HTMLElement).inert,
      pointerEvents: getComputedStyle(m).pointerEvents,
    })),
  );
}

/** Where `watchLeaving` keeps what it saw, on the page's window. */
const LEAVING_RECORD = "__e2eLeaving";

type PopoverState = Awaited<ReturnType<typeof leavingState>>[number];

/** The state of a popover leaving, as `leavingState` reads it: out of the accessibility tree and taking no clicks. */
const LEAVING: PopoverState = { leaving: true, hidden: "true", inert: true, pointerEvents: "none" };

interface LeavingRecord {
  /** When the last press before it left began (on the window, capturing): before the press closes it, and so before its exit's timer starts. */
  pressedAt: number;
  /** What the popovers went through from the moment one started leaving, each when it began: leaving, gone (none left), shown (there, none leaving). */
  phases: { phase: "leaving" | "gone" | "shown"; at: number }[];
  /** What the popovers were, as `leavingState` reads them, on every change to them while leaving. */
  states: PopoverState[][];
  /** What they were when first shown again, if they were. */
  shown: PopoverState[] | null;
}

/**
 * Watches the popovers matching `selector` leave, in the page itself (a mutation observer's, run before any timer
 * can): what they go through from the moment one starts leaving, with their state on every change while leaving and
 * when shown again. Read after the click that closes one instead, a busy machine can reach the read after its exit
 * is over (ticket 126).
 */
async function watchLeaving(page: Page, selector: string) {
  await design(page).evaluate(
    (panel, { selector, name }) => {
      const root = panel.getRootNode() as ShadowRoot | Document;
      const host = window as unknown as Record<string, LeavingRecord & { stop?: () => void }>;
      host[name]?.stop?.();
      const record: LeavingRecord & { stop?: () => void } = { pressedAt: 0, phases: [], states: [], shown: null };
      host[name] = record;
      const pressed = () => record.phases.length === 0 && (record.pressedAt = performance.now());
      window.addEventListener("pointerdown", pressed, true);
      const state = (m: Element) => ({
        leaving: m.classList.contains("is-leaving"),
        hidden: m.getAttribute("aria-hidden"),
        inert: (m as HTMLElement).inert,
        pointerEvents: getComputedStyle(m).pointerEvents,
      });
      const observer = new MutationObserver(() => {
        const all = [...root.querySelectorAll(selector)];
        const leaving = all.some((m) => m.classList.contains("is-leaving"));
        if (record.phases.length === 0 && !leaving) return;
        const phase = !all.length ? "gone" : leaving ? "leaving" : "shown";
        if (record.phases.at(-1)?.phase !== phase) {
          record.phases.push({ phase, at: performance.now() });
          if (phase === "shown") record.shown ??= all.map(state);
        }
        if (phase === "leaving") record.states.push(all.map(state));
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true });
      record.stop = () => {
        observer.disconnect();
        window.removeEventListener("pointerdown", pressed, true);
      };
    },
    { selector, name: LEAVING_RECORD },
  );
  const read = () =>
    page.evaluate((name) => {
      const { pressedAt, phases, states, shown } = (window as unknown as Record<string, LeavingRecord>)[name];
      return { pressedAt, phases, states, shown };
    }, LEAVING_RECORD);
  const phases = async () => (await read()).phases.map((p) => p.phase).join(" ");
  return {
    read,
    /**
     * Waits until they are gone, then checks that they left (as `LEAVING`, on every change, all the way) and were gone
     * no sooner than `POPOVER_EXIT_MS` after the press: timers never run early, however busy the machine.
     */
    async leaves() {
      await expect.poll(phases, { message: "gone once its exit is over", timeout: POPOVER_EXIT_MS + 1000 }).toBe("leaving gone");
      const { pressedAt, phases: [, gone], states } = await read();
      expect(states.length).toBeGreaterThan(0);
      for (const state of states) expect(state).toEqual([LEAVING]);
      expect(pressedAt).toBeGreaterThan(0);
      // `performance.now()` is coarsened a little: 1ms.
      expect(gone.at - pressedAt).toBeGreaterThanOrEqual(POPOVER_EXIT_MS - 1);
    },
    /** Waits until one is shown again, after it left: `leaving shown` if within its exit, `leaving gone shown` if after. */
    async shownAgain() {
      await expect.poll(async () => (await phases()).endsWith("shown"), { message: "shown again" }).toBe(true);
      return read();
    },
  };
}

test("a menu closed with the pointer takes no clicks at once and is gone after its exit; with Esc, it is gone at once", async ({ page }) => {
  await enterEditMode(page);
  // Nothing selected: the Design panel lists the Variables, filtered by a select.
  const filter = design(page).getByRole("combobox", { name: "Variables shown" });
  const listbox = page.getByRole("listbox", { name: "Variables shown" });
  const menus = page.locator(".tk-menu");

  // A choice clicked: the menu leaves, out of the accessibility tree and taking no clicks meanwhile.
  await filter.click();
  await expect(listbox).toBeVisible();
  await steadyBox(listbox);
  const leaves = await watchLeaving(page, ".tk-menu");
  await listbox.getByRole("option", { name: "Tailwind" }).click();
  await expect(listbox).toBeHidden();
  await expect(filter).toHaveValue("tailwind");
  // So from the moment it started leaving until it was gone, its exit's whole time after the click.
  await leaves.leaves();
  await expect(menus).toHaveCount(0);

  // Esc: gone at once, no exit.
  await filter.click();
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await menus.count()).toBe(0);

  // Enter on a choice: gone at once too. The pointer is left on the select, and the menu opens under it: the option there,
  // entered by it a frame later (later still on a busy machine), does not take the keys' place, the pointer not moved (tickets 126, 131).
  await page.keyboard.press("ArrowDown");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  expect(await menus.count()).toBe(0);
  await expect(filter).toHaveValue("all");
});

test("a menu opened again while it leaves is back at once, whole and taking clicks", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const add = design(page).getByRole("group", { name: "Effects" }).getByRole("button", { name: "Add effect" });
  const menu = page.getByRole("dialog", { name: "Add effect" });
  const menus = page.locator(".tk-menu");

  await add.click();
  await expect(menu).toBeVisible();
  // Its button clicked again, it leaves; clicked once more, it is shown at once, one menu, not leaving. That last click
  // must land within the exit, before it is gone: on a busy machine the exit can be over first, and the menu is only
  // opened anew. Then (the menu open again) the two clicks are tried again, up to 5 times in all (ticket 126).
  let watch: Awaited<ReturnType<typeof watchLeaving>>;
  let record: Awaited<ReturnType<typeof watch.read>>;
  for (let tries = 1; ; tries++) {
    watch = await watchLeaving(page, ".tk-menu");
    await add.click();
    await add.click();
    record = await watch.shownAgain();
    const went = record.phases.map((p) => p.phase).join(" ");
    if (went === "leaving shown") {
      if (tries > 1) test.info().annotations.push({ type: "tries", description: `the click within the exit on try ${tries}` });
      break;
    }
    expect(went, "the menu, left, was gone before it was shown again").toBe("leaving gone shown");
    expect(tries, "the click once more landed within the exit in one of 5 tries").toBeLessThan(5);
  }
  expect(record.states.length).toBeGreaterThan(0);
  for (const state of record.states) expect(state).toEqual([LEAVING]);
  expect(record.shown).toEqual([{ leaving: false, hidden: null, inert: false, pointerEvents: "auto" }]);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("opacity", "1");
  // The exit's time over, it is still there: the exit's end, called off, never came.
  await page.waitForTimeout(POPOVER_EXIT_MS + 100);
  expect((await watch.read()).phases.map((p) => p.phase)).toEqual(["leaving", "shown"]);
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: "Drop shadow", exact: true }).click();
  await expect(design(page).getByRole("group", { name: "Effects" }).getByRole("combobox", { name: "Shadow 1 type" })).toBeVisible();

  // A press outside closes it with the exit as well.
  await add.click();
  await expect(menu).toBeVisible();
  const leaves = await watchLeaving(page, ".tk-menu");
  await page.mouse.click(10, 10);
  await leaves.leaves();
  await expect(menus).toHaveCount(0);
});

test("the color picker leaves when closed with the pointer, and at once with Esc", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const swatch = design(page).getByRole("button", { name: "Fill color picker" });
  const picker = page.getByRole("dialog", { name: "Fill color" });
  const popovers = page.locator(".tk-popover");

  await swatch.click();
  await expect(picker).toBeVisible();
  const leaves = await watchLeaving(page, ".tk-popover");
  await picker.getByRole("button", { name: "Close" }).click();
  await expect(picker).toBeHidden();
  // Leaving, out of the accessibility tree and taking no clicks, from the moment it started until it was gone, its exit's whole time after the click.
  await leaves.leaves();
  await expect(popovers).toHaveCount(0);

  await swatch.click();
  await expect(picker).toBeVisible();
  await picker.press("Escape");
  expect(await popovers.count()).toBe(0);
});

test("a tool rested on tells its name and key in the dark tip, at the toolbar's left, level with it, after a wait", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const text = tools.getByRole("button", { name: "Text" });
  const tip = page.getByRole("tooltip");
  // The browser's own tip no more, but the name and key still told.
  await expect(text).not.toHaveAttribute("title");
  await expect(text).toHaveAttribute("aria-keyshortcuts", "T");

  // Passing over a tool shows nothing.
  await tools.getByRole("button", { name: "Select" }).hover();
  await page.waitForTimeout(TIP_DELAY_MS / 2);
  await page.mouse.move(10, 10);
  await page.waitForTimeout(TIP_DELAY_MS + 100);
  await expect(tip).toHaveCount(0);

  // Rested on: nothing before the wait, the tip after it, easing in.
  await text.hover();
  await page.waitForTimeout(TIP_DELAY_MS - 150);
  await expect(tip).toHaveCount(0);
  await expect(tip).toHaveText("Text (T)", { timeout: 1000 });
  await expect(tip).toHaveClass(/is-easing/);
  await expect(tip).toHaveCSS("background-color", "rgb(23, 23, 22)");
  const [box, bar, button] = await Promise.all([steadyBox(tip), steadyBox(tools), steadyBox(text)]);
  expect(box.x + box.width).toBeLessThanOrEqual(bar.x);
  expect(Math.abs(box.y + box.height / 2 - (button.y + button.height / 2))).toBeLessThan(1);

  await page.mouse.move(10, 10);
  await expect(tip).toHaveCount(0);
});

/** The tool's tip as it is now, read at once: what it tells, its middle, and whether it eases in; null with none. */
async function tipNow(page: Page) {
  const tips = await page.locator(".tk-tools-tip").evaluateAll((all) =>
    all.map((tip) => {
      const box = tip.getBoundingClientRect();
      return { text: tip.textContent, middle: box.top + box.height / 2, easing: tip.classList.contains("is-easing") };
    }),
  );
  return tips[0] ?? null;
}

async function middleOf(locator: Locator) {
  const box = await steadyBox(locator);
  return box.y + box.height / 2;
}

/** Well within the wait: the tip tells `text` already, without easing in. */
async function toldAtOnce(page: Page, text: string, within: number) {
  await expect.poll(() => tipNow(page), { timeout: within, intervals: [0, 16, 16, 32] }).toMatchObject({ text, easing: false });
}

test("once a tool's tip shows, another tool tells at once, beside it, without motion", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const tip = page.getByRole("tooltip");
  await tools.getByRole("button", { name: "Select" }).hover();
  await expect(tip).toHaveText("Select (V)", { timeout: TIP_DELAY_MS + 1000 });

  for (const [name, told] of [["Frame", "Frame (F)"], ["Text", "Text (T)"], ["Select", "Select (V)"]] as const) {
    const button = tools.getByRole("button", { name });
    const middle = await middleOf(button);
    await button.hover();
    await toldAtOnce(page, told, TIP_DELAY_MS / 2);
    expect(Math.abs((await tipNow(page))!.middle - middle)).toBeLessThan(1);
  }
});

test("the toolbar left and come back to within its grace tells at once; later, it waits again", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const tip = page.getByRole("tooltip");
  const text = tools.getByRole("button", { name: "Text" });
  await text.hover();
  await expect(tip).toHaveText("Text (T)", { timeout: TIP_DELAY_MS + 1000 });

  // Out and straight back onto Frame, well within the grace; the tip hidden meanwhile, read in one go.
  const frame = await steadyBox(tools.getByRole("button", { name: "Frame" }));
  await page.mouse.move(10, 10);
  await expect.poll(() => tipNow(page), { timeout: 100, intervals: [0, 16, 16] }).toBeNull();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await toldAtOnce(page, "Frame (F)", TIP_GRACE_MS);

  await page.mouse.move(10, 10);
  await expect(tip).toHaveCount(0);
  await page.waitForTimeout(TIP_GRACE_MS * 2);
  await text.hover();
  await page.waitForTimeout(TIP_DELAY_MS - 150);
  await expect(tip).toHaveCount(0);
  await expect(tip).toHaveText("Text (T)", { timeout: 1000 });
  await expect(tip).toHaveClass(/is-easing/);
});

test("a tool pressed hides its tip, the next still at once; a tool focused from the keyboard tells at once", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const tip = page.getByRole("tooltip");
  const frame = tools.getByRole("button", { name: "Frame" });
  await frame.hover();
  await expect(tip).toHaveText("Frame (F)", { timeout: TIP_DELAY_MS + 1000 });
  await frame.click();
  await expect(tip).toHaveCount(0);
  // Clicked, it has focus, but not the keyboard's: no tip while the pointer stays.
  await page.waitForTimeout(TIP_DELAY_MS + 100);
  await expect(tip).toHaveCount(0);
  await tools.getByRole("button", { name: "Text" }).hover();
  await toldAtOnce(page, "Text (T)", TIP_DELAY_MS / 2);
  await page.mouse.move(10, 10);
  await expect(tip).toHaveCount(0);

  // From the keyboard: Tab from Select onto Frame, then onto Text.
  await tools.getByRole("button", { name: "Select" }).focus();
  await page.keyboard.press("Tab");
  await expect(frame).toBeFocused();
  await toldAtOnce(page, "Frame (F)", TIP_DELAY_MS / 2);
  expect(Math.abs((await tipNow(page))!.middle - (await middleOf(frame)))).toBeLessThan(1);
  await page.keyboard.press("Tab");
  await toldAtOnce(page, "Text (T)", TIP_DELAY_MS / 2);
});
