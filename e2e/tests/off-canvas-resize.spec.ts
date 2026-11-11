import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/** Ticket 107: the layers off the canvas have handles too, dragged to resize them as on the canvas. */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const sizeLabel = (page: Page) => page.locator(".ht-size-label");
/** A handle of the layer selected, off the canvas. */
const handle = (page: Page, name: string) => page.locator(`.ht-handles[data-view="Off canvas"] .ht-handle[data-handle="${name}"]`);
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

/** How large the canvas is drawn: screen px per px of the canvas, as the layers off it are too. */
function zoomOf(page: Page) {
  return desktop(page).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

/** Where the layer off the canvas is, and how big, in canvas px: its iframe's top left on the stage, from the desktop view's, and its size. */
async function room(page: Page) {
  const [view, off] = [await steadyBox(desktop(page)), await steadyBox(offCanvas(page))];
  const zoom = await zoomOf(page);
  const [width, height] = await offCanvas(page).evaluate((frame: HTMLIFrameElement) => [frame.offsetWidth, frame.offsetHeight]);
  return { x: Math.round((off.x - view.x) / zoom), y: Math.round((off.y - view.y) / zoom), width, height };
}

/** The size of what `locator` finds, in its own document's px. */
const sizeOf = (locator: Locator) => locator.evaluate((el) => ({ width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) }));

/** A Frame drawn with F in the blank space left of the views, about 200 × 120 on screen, then made 700 × 400: selected, as drawn. */
async function frameOffCanvas(page: Page) {
  await enterEditMode(page);
  await pan(page, 500);
  const [view, area] = [await steadyBox(desktop(page)), (await viewportArea(page).boundingBox())!];
  expect(view.x - area.x).toBeGreaterThan(340);
  const at = { x: area.x + 60, y: view.y + 60 };
  await page.keyboard.press("f");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 200, at.y + 120, { steps: 6 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  // Whole px, as a handle makes them.
  for (const [name, value] of [["Width", "700"], ["Height", "400"]]) {
    await design(page).getByRole("textbox", { name, exact: true }).fill(value);
    await design(page).getByRole("textbox", { name, exact: true }).press("Enter");
  }
  // The keys the canvas's again.
  await design(page).getByRole("textbox", { name: "Height", exact: true }).blur();
  const frame = offCanvas(page).contentFrame().locator("body > *").first();
  await expect.poll(() => sizeOf(frame)).toEqual({ width: 700, height: 400 });
  return frame;
}

/** Presses a handle and drags it `by` canvas px, in steps; let go unless `drop` is false. */
async function dragHandle(page: Page, target: Locator, by: { x: number; y: number }, { drop = true } = {}) {
  const zoom = await zoomOf(page);
  const box = await steadyBox(target);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x * zoom, from.y + by.y * zoom, { steps: 8 });
  if (drop) await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a Frame off the canvas has handles; a corner dragged resizes it, and the room it takes with it, W × H meanwhile, with no change for the Agent; ⌘Z takes it back in one step; kept after a reload", async ({ page }) => {
  const frame = await frameOffCanvas(page);
  await expect(page.locator('.ht-handles[data-view="Off canvas"] .ht-handle')).toHaveCount(8);
  // Only off the canvas: the views do not show it.
  await expect(page.locator('.ht-handles:not([data-view="Off canvas"])')).toHaveCount(0);
  const before = await room(page);
  const size = await sizeOf(frame);
  expect(before).toMatchObject(size);

  await dragHandle(page, handle(page, "se"), { x: 60, y: 40 }, { drop: false });
  await expect(sizeLabel(page)).toHaveText(`${size.width + 60} × ${size.height + 40}`);
  await expect.poll(() => sizeOf(frame)).toEqual({ width: size.width + 60, height: size.height + 40 });
  await page.mouse.up();

  await expect(sizeLabel(page)).toHaveCount(0);
  // Its room as big as it is, not cut off; where it was.
  await expect.poll(() => room(page)).toEqual({ ...before, width: size.width + 60, height: size.height + 40 });
  await expect(design(page).getByRole("textbox", { name: "Width", exact: true })).toHaveValue(String(size.width + 60));
  await expect(badge(page)).toHaveCount(0);

  // Smaller than it began: no room left over.
  await dragHandle(page, handle(page, "se"), { x: -100, y: -70 });
  await expect.poll(() => room(page)).toEqual({ ...before, width: size.width - 40, height: size.height - 30 });

  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => room(page)).toEqual({ ...before, width: size.width + 60, height: size.height + 40 });
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => room(page)).toEqual(before);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(() => room(page)).toEqual({ ...before, width: size.width + 60, height: size.height + 40 });
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(badge(page)).toHaveCount(0);

  await page.waitForTimeout(800);
  await page.reload();
  await enterEditMode(page);
  await pan(page, 500);
  await expect.poll(() => room(page)).toEqual({ ...before, width: size.width + 60, height: size.height + 40 });
  await expect(badge(page)).toHaveCount(0);
});

test("dragged from its left and top, a layer off the canvas grows that way, its top left with the pointer, its right and bottom where they were; ⌘Z, ⇧⌘Z and Delete do nothing meanwhile; Esc takes it back", async ({ page }) => {
  await frameOffCanvas(page);
  const before = await room(page);
  const right = (await steadyBox(offCanvas(page))).x + (await steadyBox(offCanvas(page))).width;

  await dragHandle(page, handle(page, "nw"), { x: -50, y: -30 }, { drop: false });
  await expect.poll(() => room(page)).toEqual({ x: before.x - 50, y: before.y - 30, width: before.width + 50, height: before.height + 30 });
  const box = await steadyBox(offCanvas(page));
  expect(Math.abs(box.x + box.width - right)).toBeLessThan(2);
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.keyboard.press("Delete");
  await expect(offCanvas(page)).toHaveCount(1);
  await expect.poll(() => room(page)).toEqual({ x: before.x - 50, y: before.y - 30, width: before.width + 50, height: before.height + 30 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => room(page)).toEqual(before);

  // Let go this time: one ⌘Z takes back its size and where it is.
  await dragHandle(page, handle(page, "w"), { x: 40, y: 0 });
  await expect.poll(() => room(page)).toEqual({ ...before, x: before.x + 40, width: before.width - 40 });
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => room(page)).toEqual(before);
  await expect(badge(page)).toHaveCount(0);
});

test("dragged from its left and let go, a layer off the canvas is kept where it went, as big as it is, after a reload", async ({ page }) => {
  await frameOffCanvas(page);
  const before = await room(page);

  await dragHandle(page, handle(page, "w"), { x: -60, y: 0 });
  const after = { ...before, x: before.x - 60, width: before.width + 60 };
  await expect.poll(() => room(page)).toEqual(after);

  await page.waitForTimeout(800);
  await page.reload();
  await enterEditMode(page);
  await pan(page, 500);
  await expect.poll(() => room(page)).toEqual(after);
  await expect(badge(page)).toHaveCount(0);
});

test("a layer in a layer off the canvas has handles too, and is resized as on the canvas: its Frame keeps its own size", async ({ page }) => {
  const frame = await frameOffCanvas(page);
  const outer = await room(page);
  const box = await steadyBox(offCanvas(page));
  await page.keyboard.press("f");
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 60, { steps: 4 });
  await page.mouse.up();
  const inner = frame.locator(":scope > *").first();
  await expect(inner).toBeVisible();
  await expect(page.locator('.ht-handles[data-view="Off canvas"] .ht-handle')).toHaveCount(8);
  const size = await sizeOf(inner);

  await dragHandle(page, handle(page, "se"), { x: 30, y: 20 });

  await expect.poll(() => sizeOf(inner)).toEqual({ width: size.width + 30, height: size.height + 20 });
  await expect.poll(() => room(page)).toEqual(outer);
  await expect(badge(page)).toHaveCount(0);
});

test("a layer moved off the canvas and resized there is put back new, as it was resized, in every view", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0; background: #eee";
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).first().click();
  const title = await steadyBox(desktop(page).contentFrame().locator("h1"));
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, view.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  const heading = offCanvas(page).contentFrame().locator("h1");
  const size = await sizeOf(heading);

  await dragHandle(page, handle(page, "e"), { x: -60, y: 0 });
  await expect.poll(async () => Math.abs((await sizeOf(heading)).width - (size.width - 60))).toBeLessThanOrEqual(1);
  const resized = await sizeOf(heading);
  // As wide as it is now: its words wrap, and it is taller.
  await expect.poll(() => room(page).then((r) => r.width)).toBe(resized.width);
  expect(resized.height).toBeGreaterThan(size.height);
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  const board = desktop(page).contentFrame().locator("#board");
  await board.scrollIntoViewIfNeeded();
  const area = await steadyBox(board);
  // Pressed clear of its handles.
  const moved = await steadyBox(heading);
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + 40, area.y + 30, { steps: 10 });
  await page.mouse.up();

  await expect(offCanvas(page)).toHaveCount(0);
  for (const shown of [desktop(page), tablet(page), phone(page)]) {
    // Its width as resized, a whole px, though it was not before.
    await expect.poll(async () => Math.abs((await sizeOf(shown.contentFrame().locator("#board > h1"))).width - (size.width - 60))).toBeLessThanOrEqual(1);
  }
  await badge(page).click();
  const names = await page.getByRole("dialog", { name: "Changes" }).locator(".ht-change-name").allTextContents();
  await page.keyboard.press("Escape");
  expect(names).toEqual(["Delete · Third Kind", "Put back · Third Kind"]);
});
