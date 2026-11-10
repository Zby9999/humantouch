import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Page } from "./fixtures";

/** Ticket 106: F and T pressed in the blank space beside the views make a layer off the canvas. */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("article").first()).toBeVisible();
  await canvasInPlace(page);
}

/** Pans the workspace `dx` px to the right on screen: room opens on the left of the views. */
async function pan(page: Page, dx: number) {
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-dx, 0);
}

/** Drags from one point to another, in page px. */
async function drawFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** The change list's rows, as their titles read, the list closed again. */
async function changeTitles(page: Page): Promise<string[]> {
  if (!(await badge(page).count())) return [];
  await badge(page).click();
  const rows = await page.getByRole("dialog", { name: "Changes" }).getByRole("listitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return rows;
}

/** A Frame added to the page by hand, outside React, to draw in. */
async function addBoard(page: Page) {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0";
    document.querySelector("main")!.append(board);
  });
}

/** Where on screen the room left of the desktop view is, once panned: 300 px of it, above its top. */
async function blankSpace(page: Page) {
  await pan(page, 500);
  const [view, area] = [await steadyBox(desktop(page)), (await viewportArea(page).boundingBox())!];
  expect(view.x - area.x).toBeGreaterThan(340);
  return { x: area.x + 40, y: view.y + 40 };
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("F and a drag in the blank space make a Frame there, a layer off the canvas, selected, with no change for the Agent; ⌘Z takes it away in one step", async ({ page }) => {
  await enterEditMode(page);
  const at = await blankSpace(page);

  await page.keyboard.press("f");
  await drawFrom(page, at, { x: at.x + 200, y: at.y + 120 });

  await expect(offCanvas(page)).toHaveCount(1);
  const box = await steadyBox(offCanvas(page));
  const zoom = (await steadyBox(desktop(page))).width / (await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.offsetWidth));
  // Where it was drawn, as big as it was drawn, on screen: in the canvas's px, as much bigger as the camera has it smaller.
  expect(Math.abs(box.x - at.x)).toBeLessThan(2);
  expect(Math.abs(box.width - 200)).toBeLessThan(2);
  expect(Math.abs((await offCanvas(page).evaluate((frame: HTMLIFrameElement) => frame.offsetWidth)) - 200 / zoom)).toBeLessThan(2);
  // White, as Figma draws a Frame on an empty canvas: a fill of its own, the Design panel says so (designer, 2026-11-09).
  await expect(offCanvas(page).contentFrame().locator("body > *")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" })).toHaveCount(0);
  // Beside the canvas in the layers, selected; the tool put down.
  const first = layerTree(page).getByRole("treeitem").first();
  await expect(first).toHaveText("Frame");
  await expect(first).toHaveAttribute("aria-description", /Off canvas/);
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  await expect(badge(page)).toHaveCount(0);

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(layerTree(page).getByRole("treeitem", { name: "Frame", exact: true })).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(badge(page)).toHaveCount(0);
});

test("T clicked in the blank space makes text there, typed in at once, in the page's body text style; kept where it is after a reload", async ({ page }) => {
  await enterEditMode(page);
  const at = await blankSpace(page);

  await page.keyboard.press("t");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type("Hello there");
  await page.keyboard.press("Enter");

  const text = offCanvas(page).contentFrame().locator("body > *");
  await expect(text).toHaveText("Hello there");
  const body = await desktop(page).contentFrame().locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  await expect(text).toHaveCSS("font-family", body);
  // Text has no fill.
  await expect(text).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(layerTree(page).getByRole("treeitem").first()).toHaveText("Hello there");
  await expect(badge(page)).toHaveCount(0);
  const where = await steadyBox(offCanvas(page));

  await page.waitForTimeout(800);
  await page.reload();
  await enterEditMode(page);
  await pan(page, 500);
  await expect(offCanvas(page).contentFrame().locator("body > *")).toHaveText("Hello there");
  await expect.poll(async () => Math.round((await steadyBox(offCanvas(page))).x)).toBe(Math.round(where.x));
  await expect(badge(page)).toHaveCount(0);
});

test("while drawing in the blank space, ⌘Z and Delete do nothing; Esc puts the tool down, and nothing is made", async ({ page }) => {
  await enterEditMode(page);
  const at = await blankSpace(page);
  await page.keyboard.press("f");
  await drawFrom(page, at, { x: at.x + 100, y: at.y + 80 });
  await expect(offCanvas(page)).toHaveCount(1);

  await page.keyboard.press("f");
  await page.mouse.move(at.x, at.y + 160);
  await page.mouse.down();
  await page.mouse.move(at.x + 120, at.y + 240, { steps: 4 });
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press("Delete");
  await expect(offCanvas(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(offCanvas(page)).toHaveCount(1);
  await expect(page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
});

/**
 * A Frame with a brief and text in it, made in the blank space and put back
 * into the desktop view, or drawn there at once: the same changes either way.
 */
async function frameWithText(page: Page, offTheCanvas: boolean): Promise<string[]> {
  await addBoard(page);
  await enterEditMode(page);
  const at = offTheCanvas ? await blankSpace(page) : null;
  // Drawn on the canvas, where the one off it is put back: in a Frame's empty space.
  const board = await steadyBox(desktop(page).contentFrame().locator("#board"));
  const target = { x: board.x + 20, y: board.y + 10 };
  const start = at ?? target;

  await page.keyboard.press("f");
  await drawFrom(page, start, { x: start.x + 40, y: start.y + 30 });
  const frame = offTheCanvas ? offCanvas(page) : null;
  // On the canvas, filled white in the Design panel, as one made in the blank space is at once.
  if (!frame) await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
  // Its brief, with the Brief tool (ticket 121): its card may bring the canvas round to show it, so the Frame is found again after.
  const made = frame ?? desktop(page).contentFrame().locator("#board > div");
  await page.keyboard.press("b");
  const drawn = await steadyBox(made);
  await page.mouse.click(drawn.x + drawn.width / 2, drawn.y + drawn.height / 2);
  await expect(page.getByRole("textbox", { name: "Brief" })).toBeFocused();
  await page.getByRole("textbox", { name: "Brief" }).fill("A hero for the launch");
  await page.getByRole("textbox", { name: "Brief" }).press("Enter");
  const now = await steadyBox(made);
  await page.keyboard.press("t");
  await page.mouse.click(now.x + 4, now.y + 4);
  await page.keyboard.type("Launch");
  await page.keyboard.press("Enter");

  if (frame) {
    await expect(frame.contentFrame().getByText("Launch")).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await layerTree(page).locator("[data-off-canvas]").first().click();
    const box = await steadyBox(frame);
    // Pressed near its bottom right, on the Frame itself, clear of its text; let go with it where the one drawn on the canvas starts.
    await page.mouse.move(box.x + 32, box.y + 24);
    await page.mouse.down();
    // Where the one drawn on the canvas starts, as the canvas is now.
    const there = await steadyBox(desktop(page).contentFrame().locator("#board"));
    await page.mouse.move(there.x + 20 + 32, there.y + 10 + 24, { steps: 12 });
    await page.mouse.up();
    await expect(offCanvas(page)).toHaveCount(0);
  }
  await expect(desktop(page).contentFrame().getByText("Launch")).toBeVisible();
  return changeTitles(page);
}

test("put back in a view, a Frame made in the blank space is new there, its text and brief with it, as one drawn there is; ⌘Z, and it is off the canvas again", async ({ page }) => {
  const drawn = await frameWithText(page, false);
  expect(drawn).toHaveLength(3);
  // Gone, round and canvas, to make it again the other way.
  await badge(page).click();
  await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: "Discard all" }).click();
  await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(desktop(page)).toHaveCount(0);
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();

  const putBack = await frameWithText(page, true);

  expect(putBack).toEqual(drawn);
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().getByText("Launch")).toBeVisible();
  await expect(desktop(page).contentFrame().getByText("Launch")).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
});

test("taken back from the change list, a Frame made in the blank space and put back is off the canvas again, as it was", async ({ page }) => {
  await frameWithText(page, true);

  await badge(page).click();
  await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: /^Undo the new frame/ }).first().click();
  await page.keyboard.press("Escape");

  await expect(badge(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().getByText("Launch")).toHaveCount(0);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().getByText("Launch")).toBeVisible();
});
