import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";

/** Ticket 69: the handles of the layer selected alone, dragged to resize it, as in Figma. */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const lines = (page: Page) => page.locator('.vk-mark[data-type="line"]');
const sizeLabel = (page: Page) => page.locator(".vk-size-label");
/** A handle of the layer selected, in a view by its name. */
const handle = (page: Page, name: string, view = "Desktop") => page.locator(`.vk-handles[data-view="${view}"] .vk-handle[data-handle="${name}"]`);
const mod = process.platform === "darwin" ? "Meta" : "Control";
const HERO = '[data-testid="hero"]';

/** A Frame below the page's own content, 240 px tall, with absolute layers in it at `[left, top, width, height]`. */
async function addBoard(page: Page, layers: Record<string, number[]>, extra: Record<string, string> = {}) {
  await page.evaluate(
    ({ layers, extra }) => {
      const board = Object.assign(document.createElement("div"), { id: "board" });
      board.style.cssText = "position: relative; height: 240px; margin: 16px 0; background: #eee";
      for (const [id, [left, top, width, height]] of Object.entries(layers)) {
        const el = Object.assign(document.createElement("div"), { id });
        el.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; background: #ccc; ${extra[id] ?? ""}`;
        board.append(el);
      }
      document.querySelector("main")!.append(board);
    },
    { layers, extra },
  );
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
}

/** How large a view is drawn: screen px per px of the view. */
function zoomOf(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

/** Selects, in a view, the deepest layer under the middle of what `selector` finds there: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  await page.keyboard.down(mod);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up(mod);
}

/**
 * Presses a handle and drags it `by` px of the view (the view's own px, as
 * zoomed on screen), in steps; let go unless `drop` is false.
 */
async function dragHandle(page: Page, target: Locator, by: { x: number; y: number }, { drop = true, view = desktop(page) } = {}) {
  const zoom = await zoomOf(view);
  const box = (await target.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x * zoom, from.y + by.y * zoom, { steps: 8 });
  if (drop) await page.mouse.up();
}

/** The border box of what `selector` finds in a view, in the view's px: from its container's top left, and its size. */
function boxIn(view: Locator, selector: string) {
  return view
    .contentFrame()
    .locator(selector)
    .first()
    .evaluate((el) => {
      const [r, p] = [el.getBoundingClientRect(), el.parentElement!.getBoundingClientRect()];
      return { x: Math.round((r.left - p.left) * 100) / 100, y: Math.round((r.top - p.top) * 100) / 100, width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 };
    });
}

const field = (page: Page, name: string) => design(page).getByRole("textbox", { name, exact: true });
/** Sizes set by a handle are whole px, as a layer dragged is placed: the button's width is not, as it hugs its words. */
const sizing = (page: Page, axis: "Width" | "Height") => design(page).getByRole("combobox", { name: `${axis} sizing` });

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("the layer selected alone has handles on its corners and edges in every view; with two selected, there are none", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();

  for (const view of ["Desktop", "Tablet", "Phone"]) {
    await expect(page.locator(`.vk-handles[data-view="${view}"] .vk-handle`)).toHaveCount(8);
  }
  // The corners show as squares; the edges only as the cursor over them.
  await expect(handle(page, "se")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(handle(page, "e")).toHaveCSS("cursor", "ew-resize");

  await layerTree(page).getByRole("treeitem", { name: "Vernier Kit", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.locator(".vk-handle")).toHaveCount(0);
});

test("a corner dragged resizes both ways: Hug becomes Fixed, the panel says so, W × H shows meanwhile, and it is one change each way", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await expect(sizing(page, "Width")).toHaveValue("hug");
  const before = await boxIn(desktop(page), `${HERO} > button`);

  await dragHandle(page, handle(page, "se"), { x: 40, y: 10 }, { drop: false });
  const during = await boxIn(desktop(page), `${HERO} > button`);
  // Its Stack, centered down the hero, places it: taller, it is laid out a little higher.
  expect(during).toMatchObject({ x: before.x, width: Math.round(before.width + 40), height: Math.round(before.height + 10) });
  await expect(sizeLabel(page)).toHaveText(`${Math.round(before.width + 40)} × ${Math.round(before.height + 10)}`);
  // The selection stays on it, its handles with it.
  await expect(page.locator('.vk-selection[data-view="Desktop"]')).not.toHaveAttribute("data-hidden");
  await page.mouse.up();

  await expect(sizeLabel(page)).toHaveCount(0);
  await expect(sizing(page, "Width")).toHaveValue("fixed");
  await expect(sizing(page, "Height")).toHaveValue("fixed");
  await expect(field(page, "Width")).toHaveValue(String(Math.round(before.width + 40)));
  await expect(field(page, "Height")).toHaveValue(String(Math.round(before.height + 10)));
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");
  // The views beside follow once it is let go.
  await expect.poll(() => boxIn(phone(page), `${HERO} > button`).then((b) => b.width)).toBe(Math.round(before.width + 40));
});

test("an edge dragged resizes that way only; the other stays as it was, Hug", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const before = await boxIn(desktop(page), `${HERO} > button`);

  await dragHandle(page, handle(page, "e"), { x: 30, y: 12 });

  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual({ ...before, width: Math.round(before.width + 30) });
  await expect(sizing(page, "Width")).toHaveValue("fixed");
  await expect(sizing(page, "Height")).toHaveValue("hug");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

test("placed freely, dragged by its left or top edge, its X or Y follows and the edge across stays; ⇧ keeps its proportions, ⌥ resizes it from its middle", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");

  await dragHandle(page, handle(page, "w"), { x: -20, y: 0 });
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 80, y: 60, width: 100, height: 40 });
  await expect(field(page, "X")).toHaveValue("80");

  await dragHandle(page, handle(page, "nw"), { x: 10, y: 10 });
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 90, y: 70, width: 90, height: 30 });
  await expect(field(page, "Y")).toHaveValue("70");

  // ⇧ on a corner: 90 × 30 made twice as wide, so twice as tall.
  await page.keyboard.down("Shift");
  await dragHandle(page, handle(page, "se"), { x: 90, y: 0 });
  await page.keyboard.up("Shift");
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 90, y: 70, width: 180, height: 60 });

  // ⌥ on an edge: the edge across goes as far the other way.
  await page.keyboard.down("Alt");
  await dragHandle(page, handle(page, "e"), { x: -20, y: 0 });
  await page.keyboard.up("Alt");
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 110, y: 70, width: 140, height: 60 });
});

test("dragged past its minimum or maximum, it stops there", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40] }, { box: "min-width: 60px; max-height: 70px" });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");

  await dragHandle(page, handle(page, "se"), { x: -60, y: 60 });

  expect(await boxIn(desktop(page), "#box")).toMatchObject({ width: 60, height: 70 });
  await expect(field(page, "Width")).toHaveValue("60");
  await expect(field(page, "Height")).toHaveValue("70");
});

test("dragged near a layer beside it, its edge snaps there with a red line; with ⌘ held it does not", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40], mark: [250, 150, 40, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");
  const zoom = await zoomOf(desktop(page));

  // Its right edge 3 screen px short of the mark's left.
  await dragHandle(page, handle(page, "e"), { x: 70 - 3 / zoom, y: 0 }, { drop: false });
  await expect(lines(page).first()).toBeVisible();
  expect((await lines(page).first().boundingBox())!.width).toBeLessThanOrEqual(1.5);
  await page.keyboard.down(mod);
  await expect(lines(page)).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up(mod);
  expect((await boxIn(desktop(page), "#box")).width).not.toBe(150);

  // 4 screen px more: its right edge within 5 of the mark's left.
  await dragHandle(page, handle(page, "e"), { x: 4 / zoom, y: 0 }, { drop: false });
  await expect(lines(page).first()).toBeVisible();
  await page.mouse.up();
  await expect(lines(page)).toHaveCount(0);
  expect((await boxIn(desktop(page), "#box")).width).toBe(150);
});

test("text dragged narrower is Fixed in width, its height still Hug, following its words as they wrap", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Vernier Kit", exact: true }).click();
  const before = await boxIn(desktop(page), "h1");

  await dragHandle(page, handle(page, "e"), { x: 100 - before.width, y: 0 });

  const after = await boxIn(desktop(page), "h1");
  expect(after.width).toBe(100);
  expect(after.height).toBeGreaterThan(before.height);
  await expect(sizing(page, "Width")).toHaveValue("fixed");
  await expect(sizing(page, "Height")).toHaveValue("hug");
});

test("a locked layer is resized as a whole, its outer size", async ({ page }) => {
  await enterEditMode(page);
  await pick(page, desktop(page), '[data-testid="acme-badge"]');
  await expect(design(page).getByText("It can only be moved and resized as a whole.")).toBeVisible();
  const before = await boxIn(desktop(page), '[data-testid="acme-badge"]');

  await dragHandle(page, handle(page, "e"), { x: 20, y: 0 });

  expect((await boxIn(desktop(page), '[data-testid="acme-badge"]')).width).toBe(Math.round(before.width + 20));
  await expect(field(page, "Width")).toHaveValue(String(Math.round(before.width + 20)));
});

test("dragged in the tablet view, it is resized at the tablet's breakpoint only, its row marked; in the desktop view, at every width", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const before = await boxIn(desktop(page), `${HERO} > button`);

  await dragHandle(page, handle(page, "e", "Tablet"), { x: 30, y: 0 }, { view: tablet(page) });

  await expect.poll(() => boxIn(tablet(page), `${HERO} > button`).then((b) => b.width)).toBe(Math.round(before.width + 30));
  expect((await boxIn(desktop(page), `${HERO} > button`)).width).toBe(before.width);
  expect((await boxIn(phone(page), `${HERO} > button`)).width).toBe(before.width);
  // The row's mark (ticket 57), and the breakpoint's list.
  await expect(design(page).locator(".vk-row-mark").and(design(page).getByRole("button", { name: "Reset Width to inherit" }))).toBeVisible();
  await expect(design(page).getByRole("region", { name: "Tablet breakpoint" }).getByRole("listitem")).toHaveText(["Width"]);

  await dragHandle(page, handle(page, "e"), { x: 20, y: 0 });
  await expect(design(page).getByRole("button", { name: /to inherit$/ })).toHaveCount(0);
  await expect.poll(() => boxIn(phone(page), `${HERO} > button`).then((b) => b.width)).toBe(Math.round(before.width + 20));
  // The tablet keeps its own.
  expect((await boxIn(tablet(page), `${HERO} > button`)).width).toBe(Math.round(before.width + 30));
});

test("a resize is one undo; Esc while dragging puts it back as it was pressed, with nothing of it to redo", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const before = await boxIn(desktop(page), `${HERO} > button`);

  await dragHandle(page, handle(page, "se"), { x: 40, y: 10 });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual(before);
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect((await boxIn(desktop(page), `${HERO} > button`)).width).toBe(Math.round(before.width + 40));
  await page.keyboard.press("ControlOrMeta+z");

  await dragHandle(page, handle(page, "se"), { x: 25, y: 5 }, { drop: false });
  expect((await boxIn(desktop(page), `${HERO} > button`)).width).toBe(Math.round(before.width + 25));
  await page.keyboard.press("Escape");
  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual(before);
  await expect(sizeLabel(page)).toHaveCount(0);
  // The pointer is still down: moving it resizes nothing.
  await page.mouse.move(600, 400, { steps: 3 });
  await page.mouse.up();
  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual(before);
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual(before);
});

/**
 * Presses the right edge's handle and moves it 4 px straight down: far enough
 * to begin, its width as it was. Held, once the resize has made that step.
 */
async function pressRightEdgeWithoutResizing(page: Page) {
  const edge = (await handle(page, "e").boundingBox())!;
  const from = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 4, { steps: 4 });
  await expect(sizeLabel(page)).toBeVisible();
  return from;
}

test("Esc on a resize that has changed nothing takes nothing back: the fill changed before it stays, and can be undone and redone", async ({ page }) => {
  // Fixed at 256 wide, as `w-64` is: a step that leaves it 256 wide changes nothing.
  await addBoard(page, { box: [100, 60, 256, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");
  await field(page, "Fill color").fill("FF0000");
  await field(page, "Fill color").press("Enter");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  const red = "rgb(255, 0, 0)";
  const fill = () => desktop(page).contentFrame().locator("#box").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill()).toBe(red);

  await pressRightEdgeWithoutResizing(page);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  expect(await fill()).toBe(red);
  expect((await boxIn(desktop(page), "#box")).width).toBe(256);
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await fill()).toBe(red);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await fill()).toBe("rgb(204, 204, 204)");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await fill()).toBe(red);
});

test("two resizes of the same layer in a row are an undo each, though the second begins without changing the size", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");
  const zoom = await zoomOf(desktop(page));

  await dragHandle(page, handle(page, "e"), { x: 20, y: 0 });
  expect((await boxIn(desktop(page), "#box")).width).toBe(100);

  // Pressed again, first straight down, its width as the first resize left it; then 30 wider.
  const from = await pressRightEdgeWithoutResizing(page);
  await page.mouse.move(from.x + 30 * zoom, from.y + 4, { steps: 6 });
  await page.mouse.up();
  expect((await boxIn(desktop(page), "#box")).width).toBe(130);

  await page.keyboard.press("ControlOrMeta+z");
  expect((await boxIn(desktop(page), "#box")).width).toBe(100);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await boxIn(desktop(page), "#box")).width).toBe(80);

  // And Esc on the second takes back the second only.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await pressRightEdgeWithoutResizing(page);
  await page.mouse.move(from.x + 30 * zoom, from.y + 4, { steps: 6 });
  await expect.poll(async () => (await boxIn(desktop(page), "#box")).width).toBe(130);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await boxIn(desktop(page), "#box")).width).toBe(100);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await boxIn(desktop(page), "#box")).width).toBe(80);
});

test("while a handle is held, ⌘Z and Delete do nothing; let go, they work again", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const before = await boxIn(desktop(page), `${HERO} > button`);

  await dragHandle(page, handle(page, "e"), { x: 30, y: 0 }, { drop: false });
  for (const key of ["ControlOrMeta+z", "Delete"]) {
    await page.keyboard.press(key);
    expect((await boxIn(desktop(page), `${HERO} > button`)).width).toBe(Math.round(before.width + 30));
  }
  await page.mouse.up();
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  await page.keyboard.press("ControlOrMeta+z");
  expect(await boxIn(desktop(page), `${HERO} > button`)).toEqual(before);
});

test("dragged out and back, or with ⌥ let go before the pointer moves again, it is as the handle is now: the edges not dragged where they were", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40] });
  await enterEditMode(page);
  await pick(page, desktop(page), "#box");
  const zoom = await zoomOf(desktop(page));

  // The left edge out 20, then back 12: X follows it, the right edge stays.
  const left = (await handle(page, "w").boundingBox())!;
  const pressed = { x: left.x + left.width / 2, y: left.y + left.height / 2 };
  await page.mouse.move(pressed.x, pressed.y);
  await page.mouse.down();
  await page.mouse.move(pressed.x - 20 * zoom, pressed.y, { steps: 4 });
  await page.mouse.move(pressed.x - 8 * zoom, pressed.y, { steps: 4 });
  await page.mouse.up();
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 92, y: 60, width: 88, height: 40 });

  const edge = (await handle(page, "e").boundingBox())!;
  const from = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(from.x + 20 * zoom, from.y, { steps: 4 });
  expect(await boxIn(desktop(page), "#box")).toEqual({ x: 72, y: 60, width: 128, height: 40 });
  // ⌥ let go, the pointer still: from the left edge again, which goes back where it was.
  await page.keyboard.up("Alt");
  await expect.poll(() => boxIn(desktop(page), "#box")).toEqual({ x: 92, y: 60, width: 108, height: 40 });
  await page.mouse.up();
  await expect(field(page, "X")).toHaveValue("92");
});

test("a locked layer stops at the minimum width its own styles give it", async ({ page }) => {
  await page.addStyleTag({ content: '[data-testid="acme-badge"] { min-width: 50px; }' });
  await enterEditMode(page);
  await pick(page, desktop(page), '[data-testid="acme-badge"]');

  await dragHandle(page, handle(page, "e"), { x: -60, y: 0 });

  expect((await boxIn(desktop(page), '[data-testid="acme-badge"]')).width).toBe(50);
  await expect(field(page, "Width")).toHaveValue("50");
  // Recorded as it shows: the change says 50px, not the smaller width the pointer went to.
  await badge(page).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/^Width.*Fixed 50px$/]);
});

test("pressed with ⌘ held, a handle selects the deepest layer under it, as anywhere on the canvas", async ({ page }) => {
  await addBoard(page, { box: [100, 60, 80, 40] });
  await page.evaluate(() => {
    const inner = Object.assign(document.createElement("div"), { id: "inner" });
    inner.style.cssText = "position: absolute; inset: 0; background: #999";
    document.getElementById("box")!.append(inner);
  });
  await enterEditMode(page);
  // The box, the layer around what is under the pointer.
  await pick(page, desktop(page), "#inner");
  await page.keyboard.press("Escape");
  await expect(page.locator(".vk-handle")).toHaveCount(24);
  const edge = (await handle(page, "w").boundingBox())!;

  // Just inside the box's left edge, on what fills it.
  await page.keyboard.down(mod);
  await page.mouse.click(edge.x + edge.width - 1, edge.y + edge.height / 2);
  await page.keyboard.up(mod);

  // What fills it selected now: its handles are on it, as large as the box.
  await expect(design(page).getByRole("textbox", { name: "X", exact: true })).toHaveValue("0");
  await expect(badge(page)).toHaveCount(0);
});
