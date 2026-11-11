import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, steadyBox, expect, test, type Locator, type Page } from "./fixtures";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const marks = (page: Page, type: string) => page.locator(`.ht-mark[data-type="${type}"]`);
const mod = process.platform === "darwin" ? "Meta" : "Control";
const HERO = '[data-testid="hero"]';

/** A Frame below the page's own content, 240 px tall, with absolute layers in it at `[left, top, width, height]`. */
async function addBoard(page: Page, layers: Record<string, number[]>) {
  await page.evaluate((layers) => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px; margin: 16px 0; background: #eee";
    for (const [id, [left, top, width, height]] of Object.entries(layers)) {
      const el = Object.assign(document.createElement("div"), { id });
      el.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; background: #ccc`;
      board.append(el);
    }
    document.querySelector("main")!.append(board);
  }, layers);
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** How large a view is drawn: screen px per px of the view. */
function zoomOf(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

/** Selects, in a view, the deepest layer under the middle of what `selector` finds there. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = await steadyBox(view.contentFrame().locator(selector));
  await page.keyboard.down(mod);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up(mod);
}

/**
 * Presses on the middle of what `selector` finds in a view and drags it so its
 * top left is at `at` in the board, in the view's px, then `nudge` screen px
 * further; let go unless `drop` is false.
 */
async function dragInBoard(page: Page, view: Locator, selector: string, at: { x: number; y: number }, { nudge = { x: 0, y: 0 }, drop = true } = {}) {
  const zoom = await zoomOf(view);
  const start = (await view.contentFrame().locator(selector).boundingBox())!;
  const board = (await view.contentFrame().locator("#board").boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + at.x * zoom + nudge.x + start.width / 2, board.y + at.y * zoom + nudge.y + start.height / 2, { steps: 8 });
  if (drop) await page.mouse.up();
}

/** Where what `selector` finds is in the board of a view: its border box from the board's top left, in the view's px. */
function placeIn(view: Locator, selector: string) {
  return view
    .contentFrame()
    .locator(selector)
    .evaluate((el) => {
      const [r, b] = [el.getBoundingClientRect(), document.getElementById("board")!.getBoundingClientRect()];
      return { x: r.left - b.left, y: r.top - b.top };
    });
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("dragged freely near a layer's edge, it snaps there, with a red line along both, 1px on screen", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();

  // Its left 3 screen px right of the mark's.
  await dragInBoard(page, desktop(page), `${HERO} > button`, { x: 100, y: 30 }, { nudge: { x: 3, y: 0 }, drop: false });
  const line = marks(page, "line").first();
  await expect(line).toBeVisible();
  await expect.poll(async () => (await line.boundingBox())!.width).toBeLessThanOrEqual(1.5);
  await page.mouse.up();

  await expect(marks(page, "line")).toHaveCount(0);
  await expect.poll(async () => (await placeIn(desktop(page), "#board > button")).x).toBeCloseTo(100, 1);
});

test("with ⌘ held, it does not snap: the lines go as ⌘ is pressed, and come back as it is let go", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();

  await dragInBoard(page, desktop(page), `${HERO} > button`, { x: 100, y: 30 }, { nudge: { x: 3, y: 0 }, drop: false });
  await expect(marks(page, "line").first()).toBeVisible();
  await page.keyboard.down(mod);
  await expect(marks(page, "line")).toHaveCount(0);
  await page.keyboard.up(mod);
  await expect(marks(page, "line").first()).toBeVisible();
  await page.keyboard.down(mod);
  await page.mouse.up();
  await page.keyboard.up(mod);

  // Where it was let go, 3 screen px off the mark's edge.
  await expect(async () => {
    const x = (await placeIn(desktop(page), "#board > button")).x;
    expect(Math.abs(x - 100)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(x - 100 - 3 / (await zoomOf(desktop(page))))).toBeLessThanOrEqual(2);
  }).toPass({ timeout: 5_000 });
});

test("dragged to as far from two layers in a row as they are from each other, it snaps there, each equal space marked in magenta with its size", async ({ page }) => {
  await addBoard(page, { one: [500, 100, 40, 40], two: [560, 100, 40, 40] });
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();

  await dragInBoard(page, desktop(page), `${HERO} > button`, { x: 620, y: 100 }, { nudge: { x: 3, y: 2 }, drop: false });
  const gaps = marks(page, "gap");
  await expect(gaps).toHaveCount(2);
  await expect(gaps.locator(".ht-mark-label")).toHaveText(["20", "20"]);
  await expect(gaps.first()).toHaveCSS("border-top-color", "rgb(232, 28, 196)");
  await page.mouse.up();

  await expect.poll(() => placeIn(desktop(page), "#board > button")).toEqual({ x: 620, y: 100 });
});

test("dragged in the tablet view, it snaps to what is there as the tablet view lays it out, the lines drawn in that view, and is placed there at its breakpoint", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  await pick(page, tablet(page), "#mark");
  // The board is 720 px wide in the tablet view: the mark's middle 3 screen px off the board's.
  await dragInBoard(page, tablet(page), "#mark", { x: 330, y: 120 }, { nudge: { x: 3, y: 0 }, drop: false });
  await expect(page.locator('.ht-marks[data-view="Tablet"] .ht-mark[data-type="line"]').first()).toBeVisible();
  await expect(page.locator('.ht-marks:not([data-view="Tablet"])')).toHaveCount(0);
  await page.mouse.up();

  await expect.poll(async () => (await placeIn(tablet(page), "#mark")).x).toBeCloseTo(330, 1);
  await expect.poll(async () => (await placeIn(desktop(page), "#mark")).x).toBe(100);
});

test("a layer off the canvas dragged back into a Frame's empty space snaps as any layer dragged there does", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  // Room on the left of the views, and the title moved off the canvas there.
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-400, 0);
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first().click();
  const view = (await desktop(page).boundingBox())!;
  const title = (await desktop(page).contentFrame().locator("h1").boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, view.y + 100, { steps: 10 });
  await page.mouse.up();
  const outside = page.locator('iframe[title="Off canvas"]:visible');
  await expect(outside).toHaveCount(1);

  // Pressed inside its top left, clear of its handles as it is selected (ticket 107), let go with its left 3 screen px right of the mark's.
  const zoom = await zoomOf(desktop(page));
  const start = (await outside.contentFrame().locator("body > *").first().boundingBox())!;
  const board = (await desktop(page).contentFrame().locator("#board").boundingBox())!;
  const grab = { x: Math.min(12, start.width / 2), y: start.height / 2 };
  await page.mouse.move(start.x + grab.x, start.y + grab.y);
  await page.mouse.down();
  await page.mouse.move(board.x + 100 * zoom + 3 + grab.x, board.y + 30 * zoom + grab.y, { steps: 10 });
  await expect(marks(page, "line").first()).toBeVisible();
  await page.mouse.up();

  await expect(outside).toHaveCount(0);
  await expect.poll(async () => (await placeIn(desktop(page), "#board > h1")).x).toBeCloseTo(100, 1);
});

test("with ⌥ held, the distances from the layer selected to the one pointed at show, or to its container pointed at itself; let go, they go", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const paragraph = (await desktop(page).contentFrame().locator(`${HERO} > p`).boundingBox())!;
  const button = (await desktop(page).contentFrame().locator(`${HERO} > button`).boundingBox())!;

  await page.keyboard.down("Alt");
  await page.mouse.move(paragraph.x + paragraph.width / 2, paragraph.y + paragraph.height / 2);
  // The button sits 24 px (mt-6) below the paragraph.
  await expect(marks(page, "distance")).toHaveCount(1);
  await expect(marks(page, "distance").locator(".ht-mark-label")).toHaveText("24");
  // A label is one size at any zoom.
  await expect(marks(page, "distance").locator(".ht-mark-label")).toHaveCSS("font-size", "11px");

  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  // To the hero section around it: above, below and to its right; its left edge is the section's.
  await expect(marks(page, "distance")).toHaveCount(3);
  await page.keyboard.up("Alt");
  await expect(marks(page, "distance")).toHaveCount(0);
});

test("with ⌥ held and several layers selected, the distances are from all of them as one", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await layerTree(page).getByRole("treeitem", { name: "A Framer-style editor layer for any page." }).click({ modifiers: ["Shift"] });
  const title = (await desktop(page).contentFrame().locator("h1").boundingBox())!;

  await page.keyboard.down("Alt");
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  // From the paragraph's top, the higher of the two, to the header 16 px (mt-4) above it.
  await expect(marks(page, "distance").locator(".ht-mark-label")).toHaveText(["16"]);
  await page.keyboard.up("Alt");
});

test("the arrow keys nudge a free layer 1px, 10px with ⇧, as X and Y; a run of nudges is undone at once", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#mark");
  await expect(design(page).getByRole("textbox", { name: "X", exact: true })).toHaveValue("100");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => placeIn(desktop(page), "#mark")).toEqual({ x: 102, y: 130 });
  await expect(design(page).getByRole("textbox", { name: "X", exact: true })).toHaveValue("102");
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveAccessibleName("2 changes not applied yet");

  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => placeIn(desktop(page), "#mark")).toEqual({ x: 100, y: 120 });
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(() => placeIn(desktop(page), "#mark")).toEqual({ x: 102, y: 130 });
});

test("in a Stack, the arrow keys along it swap the layer with the next one that way, as one reorder; across it, nothing", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const order = () => desktop(page).contentFrame().locator(HERO).evaluate((el) => [...el.children].map((child) => child.localName));

  await page.keyboard.press("ArrowUp");
  await expect.poll(order).toEqual(["header", "button", "p"]);
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(order).toEqual(["button", "header", "p"]);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect.poll(order).toEqual(["button", "header", "p"]);
  await expect(layerTree(page).getByRole("treeitem", { name: "Button", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toReadAs([/Reorder.*Button.*3rd → 1st/]);
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(order).toEqual(["header", "p", "button"]);
});

test("nudged in the phone view, a free layer moves there only, at the phone's breakpoint", async ({ page }) => {
  await addBoard(page, { mark: [100, 120, 60, 40] });
  await enterEditMode(page);
  await pick(page, phone(page), "#mark");
  // Selected, and the phone view worked in: the panel shows the mark's place there.
  await expect(design(page).getByRole("textbox", { name: "X", exact: true })).toHaveValue("100");

  await page.keyboard.press("Shift+ArrowRight");

  await expect.poll(() => placeIn(phone(page), "#mark")).toEqual({ x: 110, y: 120 });
  await expect.poll(() => placeIn(desktop(page), "#mark")).toEqual({ x: 100, y: 120 });
  // Marked changed on its field, at the phone's breakpoint.
  await expect(design(page).getByRole("button", { name: "Reset x" })).toBeVisible();
  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toContainText(["below 768px"]);
});

test("nudged in the phone view, a layer in a Frame's flow is placed freely there only, which the change list tells and undoes back into the flow", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0; padding: 8px; background: #eee";
    const chip = Object.assign(document.createElement("div"), { id: "chip" });
    // Inline in its flow: the board is a Frame, not a plain top-to-bottom flow shown as a Stack.
    chip.style.cssText = "display: inline-block; width: 80px; height: 30px; background: #ccc";
    board.append(chip);
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  const position = (view: Locator) => view.contentFrame().locator("#chip").evaluate((el) => getComputedStyle(el).position);
  await pick(page, phone(page), "#chip");
  const was = await placeIn(phone(page), "#chip");

  await page.keyboard.press("Shift+ArrowDown");

  await expect.poll(() => placeIn(phone(page), "#chip")).toEqual({ x: was.x, y: was.y + 10 });
  await expect.poll(() => position(phone(page))).toBe("absolute");
  await expect.poll(() => position(desktop(page))).toBe("static");
  await expect.poll(() => placeIn(desktop(page), "#chip")).toEqual(was);
  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toReadAs([/Absolute.*below 768px.*in the layout → X 8px, Y 18px/]);

  // Its X and Y there are what places it: undone from the change list (the breakpoint lists none, designer, 2026-11-07), it is in the flow again.
  await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: /^Undo the absolute/ }).click();
  await expect.poll(() => position(phone(page))).toBe("static");
  await expect.poll(() => placeIn(phone(page), "#chip")).toEqual(was);
  await expect(page.locator("[data-ht-changes-opener]")).toHaveCount(0);
});
