import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/**
 * Ticket 79 (ADR 0014): layers placed freely from their container's right or
 * bottom edge, or centered by `translate: -50%`, stay placed so as they are
 * moved: dragged on the canvas, nudged, or given an X or Y in the panel. So
 * does one centered by auto margins between its sides (ticket 96), its
 * width set or held by its `max-width` (ticket 97). Layers centered by auto
 * margins do not jump as they are dragged out of a layout or their Frame is
 * ungrouped either (ticket 97).
 */

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const everyView = (page: Page) => [desktop(page), tablet(page), phone(page)];
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const field = (page: Page, name: string) => design(page).getByRole("textbox", { name, exact: true });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const handle = (page: Page, name: string) => page.locator(`.tk-handles[data-view="Desktop"] .tk-handle[data-handle="${name}"]`);
const mod = process.platform === "darwin" ? "Meta" : "Control";

/**
 * A Frame below the page's own content, as wide as the page and `height`
 * tall (240 px; one that grows with the view's width, for a layer placed from
 * its bottom), with one layer in it, 80 × 40, placed by `css`.
 */
async function addBoard(page: Page, css: string, height = "240px") {
  await page.evaluate(([css, height]) => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = `position: relative; height: ${height}; margin: 16px 0; background: #eee`;
    const tag = Object.assign(document.createElement("div"), { id: "tag" });
    tag.style.cssText = `position: absolute; width: 80px; height: 40px; background: #ccc; ${css}`;
    board.append(tag);
    document.querySelector("main")!.append(board);
  }, [css, height]);
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** Selects the layer under the middle of the tag in a view (the desktop view), the deepest there: the view is the one worked in from then on. */
async function pickTag(page: Page, view = desktop(page)) {
  const box = await steadyBox(view.contentFrame().locator("#tag").first());
  await page.keyboard.down(mod);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up(mod);
}

/** How large a view is drawn: screen px per px of the view. */
function zoomOf(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

/**
 * Presses the tag in a view (the desktop view) and drags it `by` px of the view, in
 * steps, ⌘ held once it moves, so it snaps to nothing; let go unless `drop` is false.
 */
async function dragTag(page: Page, by: { x: number; y: number }, { drop = true, view = desktop(page) } = {}) {
  const zoom = await zoomOf(view);
  const box = await steadyBox(view.contentFrame().locator("#tag").first());
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y, { steps: 2 });
  await page.keyboard.down(mod);
  await page.mouse.move(from.x + by.x * zoom, from.y + by.y * zoom, { steps: 8 });
  if (!drop) return;
  await page.mouse.up();
  await page.keyboard.up(mod);
}

/**
 * Where the tag is in its container in a view, in the view's px: how far
 * each of its edges is from the container's, and how far its middle is past
 * the container's across (`off`).
 */
function gapsIn(view: Locator) {
  return view
    .contentFrame()
    .locator("#tag")
    .evaluate((el) => {
      const [r, p] = [el.getBoundingClientRect(), el.parentElement!.getBoundingClientRect()];
      const round = (n: number) => Math.round(n * 100) / 100;
      return { left: round(r.left - p.left), right: round(p.right - r.right), top: round(r.top - p.top), bottom: round(p.bottom - r.bottom), off: round((r.left + r.right - p.left - p.right) / 2) };
    });
}

/** Where the tag is in every view, once the views beside have caught up. */
async function expectInEveryView(page: Page, gaps: Partial<Awaited<ReturnType<typeof gapsIn>>>) {
  for (const view of everyView(page)) await expect.poll(() => gapsIn(view)).toMatchObject(gaps);
}

const number = async (page: Page, name: string) => Number(await field(page, name).inputValue());

/** How wide the tag is drawn in a view. */
const widthIn = (view: Locator) => view.contentFrame().locator("#tag").evaluate((el) => el.getBoundingClientRect().width);

/** Drags a handle of the selection in the desktop view `by` px of the view across. */
async function dragHandle(page: Page, name: string, by: number) {
  const zoom = await zoomOf(desktop(page));
  const edge = await steadyBox(handle(page, name));
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + by * zoom, edge.y + edge.height / 2, { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("placed from the right: dragged, nudged or given an X, it stays placed from the right, its `right` changing, so in every view its right edge is as far from its container's", async ({ page }) => {
  await addBoard(page, "top: 60px; right: 40px");
  await enterEditMode(page);
  await pickTag(page);
  const x = await number(page, "X");
  await expectInEveryView(page, { right: 40, top: 60 });

  await dragTag(page, { x: -100, y: 20 });
  const dragged = x - (await number(page, "X"));
  expect(Math.abs(dragged - 100)).toBeLessThanOrEqual(1);
  await expectInEveryView(page, { right: 40 + dragged, top: 80 });
  // Its right and its Y: no X.
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expectInEveryView(page, { right: 51 + dragged });
  await expect(field(page, "X")).toHaveValue(String(x - dragged - 11));

  await field(page, "X").fill(String(x - 60));
  await field(page, "X").press("Enter");
  await expectInEveryView(page, { right: 100, top: 80 });
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");

  // The X typed is a step of its own; the drag, one step, back to where it was pressed.
  await page.keyboard.press("ControlOrMeta+z");
  await expectInEveryView(page, { right: 51 + dragged });
  for (let i = 0; i < 4 && (await badge(page).count()); i++) await page.keyboard.press("ControlOrMeta+z");
  await expectInEveryView(page, { right: 40, top: 60 });
});

test("placed from the bottom: dragged, nudged or given a Y, it stays placed from the bottom, its `bottom` changing", async ({ page }) => {
  // Taller as the view is wider: its top edge is as far from the board's in no two views.
  await addBoard(page, "left: 120px; bottom: 30px", "calc(120px + 15vw)");
  await enterEditMode(page);
  await pickTag(page);
  const y = await number(page, "Y");

  await dragTag(page, { x: 0, y: -50 });
  const dragged = y - (await number(page, "Y"));
  expect(Math.abs(dragged - 50)).toBeLessThanOrEqual(1);
  await expectInEveryView(page, { bottom: 30 + dragged, left: 120 });
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  await page.keyboard.press("ArrowDown");
  await expectInEveryView(page, { bottom: 29 + dragged });

  await field(page, "Y").fill(String(y - 100));
  await field(page, "Y").press("Enter");
  await expectInEveryView(page, { bottom: 130, left: 120 });
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

for (const [name, css] of [
  ["Tailwind v4's `translate`", "translate: -50% 0"],
  ["Tailwind v3's `transform`", "transform: translate(-50%, 0)"],
] as const) {
  test(`centered by ${name}: dragged, it stays under the pointer and lands where it is let go, not half its width aside; dragged, nudged or given an X, it stays centered in every view, past the middle by as much`, async ({ page }) => {
    await addBoard(page, `top: 60px; left: 50%; ${css}`);
    await enterEditMode(page);
    await pickTag(page);
    const x = await number(page, "X");
    await expectInEveryView(page, { off: 0 });
    const start = await gapsIn(desktop(page));

    // Midway, it is where the pointer has taken it, not half its width to the right.
    await dragTag(page, { x: 100, y: 0 }, { drop: false });
    const midway = await gapsIn(desktop(page));
    expect(Math.abs(midway.left - start.left - 100)).toBeLessThanOrEqual(1);
    await page.mouse.up();
    await page.keyboard.up(mod);
    // X is its middle, as before: it moved as far as it was dragged, and is drawn there.
    const dragged = (await number(page, "X")) - x;
    expect(Math.abs(dragged - 100)).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await gapsIn(desktop(page))).left - start.left).toBe(dragged);
    await expectInEveryView(page, { off: dragged, top: 60 });
    await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

    await page.keyboard.press("ArrowRight");
    await expectInEveryView(page, { off: dragged + 1 });

    await field(page, "X").fill(String(x - 30));
    await field(page, "X").press("Enter");
    await expectInEveryView(page, { off: -30, top: 60 });

    // Esc while dragging: back where it was pressed.
    await dragTag(page, { x: 60, y: 30 }, { drop: false });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.keyboard.up(mod);
    await expectInEveryView(page, { off: -30, top: 60 });
    await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  });
}

test("centered by auto margins (`inset-x-0 mx-auto`): its X reads where it is drawn; dragged, nudged, given an X or resized, it stays centered in every view, past the middle by as much (ticket 96)", async ({ page }) => {
  await addBoard(page, "top: 60px; left: 0; right: 0; margin-inline: auto");
  await enterEditMode(page);
  await pickTag(page);
  await expectInEveryView(page, { off: 0, top: 60 });
  const start = await gapsIn(desktop(page));
  // Its X: where it is drawn, not its `left`, 0.
  await expect(field(page, "X")).toHaveValue(String(start.left));

  // Midway, where the pointer has taken it; let go, there, centered as far past the middle in every view.
  await dragTag(page, { x: 100, y: 0 }, { drop: false });
  await expect.poll(async () => Math.abs((await gapsIn(desktop(page))).left - start.left - 100)).toBeLessThanOrEqual(1);
  await page.mouse.up();
  await page.keyboard.up(mod);
  await expect.poll(async () => Math.abs((await number(page, "X")) - start.left - 100)).toBeLessThanOrEqual(1);
  const dragged = (await number(page, "X")) - start.left;
  await expect.poll(async () => (await gapsIn(desktop(page))).left - start.left).toBe(dragged);
  await expectInEveryView(page, { off: dragged, top: 60 });
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  // Nudged, it moves a px, not to its `left`.
  await page.keyboard.press("ArrowLeft");
  await expectInEveryView(page, { off: dragged - 1 });
  await expect(field(page, "X")).toHaveValue(String(start.left + dragged - 1));

  await field(page, "X").fill(String(start.left - 30));
  await field(page, "X").press("Enter");
  await expectInEveryView(page, { off: -30, top: 60 });

  // Its right edge 20 px out: it grows on both sides alike, its middle where it was.
  await dragHandle(page, "e", 20);
  await expectInEveryView(page, { off: -30, top: 60 });
  for (const view of everyView(page)) await expect.poll(() => widthIn(view)).toBe(120);
  // Its X and its width: never a `right` of its own.
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");
});

test("centered by auto margins, its width `auto`, held by its `max-width` (`inset-x-0 mx-auto max-w-*`), filling the phone's board: dragged, nudged, given an X or resized, it stays centered in every view, past the middle by as much, and never narrower (ticket 97)", async ({ page }) => {
  // 400 px at most: centered in the desktop's board, 848 px, and the tablet's, 720; filling the phone's, 342.
  await addBoard(page, "top: 60px; left: 0; right: 0; margin-inline: auto; width: auto; max-width: 400px");
  await enterEditMode(page);
  await pickTag(page);
  const widths = (...each: number[]) => Promise.all(everyView(page).map(async (view, i) => expect.poll(() => widthIn(view)).toBe(each[i])));
  await expectInEveryView(page, { off: 0, top: 60 });
  await widths(400, 400, 342);
  // Its X: where it is drawn, (848 - 400) / 2.
  await expect(field(page, "X")).toHaveValue("224");

  await page.keyboard.press("ArrowLeft");
  await expectInEveryView(page, { off: -1 });
  await widths(400, 400, 342);
  await expect(field(page, "X")).toHaveValue("223");

  await field(page, "X").fill("244");
  await field(page, "X").press("Enter");
  await expectInEveryView(page, { off: 20, top: 60 });
  await widths(400, 400, 342);

  await dragTag(page, { x: 100, y: 0 });
  await expect.poll(async () => Math.abs((await number(page, "X")) - 344)).toBeLessThanOrEqual(1);
  const dragged = (await number(page, "X")) - 224;
  await expectInEveryView(page, { off: dragged, top: 60 });
  await widths(400, 400, 342);
  // Its X, one change, however it is moved.
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  // Its right edge 20 px out: its maximum 40 px more, on both sides alike; the phone's board it still fills.
  await dragHandle(page, "e", 20);
  await expectInEveryView(page, { off: dragged, top: 60 });
  await widths(440, 440, 342);
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");
});

test("in a Stack's layout, centered by its auto margins (`mx-auto w-*`), dragged into a Frame: it lands where it is let go, at that X in every view (ticket 97)", async ({ page }) => {
  await page.evaluate(() => {
    const column = Object.assign(document.createElement("div"), { id: "column" });
    column.style.cssText = "display: flex; flex-direction: column; margin: 16px 0";
    const tag = Object.assign(document.createElement("div"), { id: "tag" });
    tag.style.cssText = "margin-inline: auto; width: 80px; height: 40px; background: #ccc";
    column.append(tag);
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px; margin: 16px 0; background: #eee";
    document.querySelector("main")!.append(column, board);
  });
  await enterEditMode(page);
  // Drawn at (848 - 80) / 2 in its column; dragged 30 px right and into the board, 100 px below its top edge.
  await expect.poll(() => gapsIn(desktop(page))).toMatchObject({ left: 384 });
  await pickTag(page);
  const [tag, board] = await Promise.all(["#tag", "#board"].map((id) => desktop(page).contentFrame().locator(id).evaluate((el) => el.getBoundingClientRect().top)));
  await dragTag(page, { x: 30, y: board - tag + 100 });
  for (const view of everyView(page)) await expect(view.contentFrame().locator("#board > #tag")).toHaveCount(1);
  await expectInEveryView(page, { left: 414, top: 100 });
});

test("a Frame ungrouped, its layer centered by auto margins: the layer stays where it is drawn in every view, centered so in the container it goes into (ticket 97)", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px; margin: 16px 0; background: #eee";
    const card = Object.assign(document.createElement("div"), { id: "card" });
    card.style.cssText = "position: absolute; left: 0; right: 0; top: 40px; height: 120px; background: #ddd";
    const tag = Object.assign(document.createElement("div"), { id: "tag" });
    tag.style.cssText = "position: absolute; top: 20px; left: 0; right: 0; margin-inline: auto; width: 80px; height: 40px; background: #ccc";
    card.append(tag);
    board.append(card);
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  await expectInEveryView(page, { off: 0, top: 20 });
  // The card, away from the tag.
  const box = await steadyBox(desktop(page).contentFrame().locator("#card"));
  await page.keyboard.down(mod);
  await page.mouse.click(box.x + 10, box.y + box.height - 10);
  await page.keyboard.up(mod);
  await page.keyboard.press("ControlOrMeta+Shift+g");
  for (const view of everyView(page)) await expect(view.contentFrame().locator("#board > #tag")).toHaveCount(1);
  await expectInEveryView(page, { off: 0, top: 60 });
});

test("placed from the right, resized and then moved, or moved and then resized: its width and its `right`, two changes, in every view as far from the right edge as it was left", async ({ page }) => {
  await addBoard(page, "top: 60px; right: 40px");
  await enterEditMode(page);
  await pickTag(page);

  // Its right edge 20 px out: 20 px from the right, 100 wide.
  const zoom = await zoomOf(desktop(page));
  const edge = (await handle(page, "e").boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 20 * zoom, edge.y + edge.height / 2, { steps: 6 });
  await page.mouse.up();
  await expectInEveryView(page, { right: 20 });

  await field(page, "X").fill(String((await number(page, "X")) - 50));
  await field(page, "X").press("Enter");
  await expectInEveryView(page, { right: 70 });
  await field(page, "Width").fill("60");
  await field(page, "Width").press("Enter");
  // Its left edge stays, as in Figma: its right edge 40 px further in.
  await expectInEveryView(page, { right: 110 });
  // Its width and its `right`: never an X.
  await expect(badge(page)).toHaveAccessibleName("2 changes not applied yet");
});

test("placed from the right, dragged into another Frame or copied with ⌥: there, it and its copy stay placed from the right, as Figma's constraints go with a layer (designer, 2026-11-02)", async ({ page }) => {
  await addBoard(page, "top: 60px; right: 40px");
  // Another Frame below, as tall: the tag dragged straight down that far lands in it, as far from its right edge.
  await page.evaluate(() => {
    const other = Object.assign(document.createElement("div"), { id: "other" });
    other.style.cssText = "position: relative; height: 240px; margin: 16px 0; background: #ddd";
    document.querySelector("main")!.append(other);
  });
  await enterEditMode(page);
  await pickTag(page);

  // A copy, let go with ⌥ held, 100 px left: the original stays.
  await page.keyboard.down("Alt");
  await dragTag(page, { x: -100, y: 0 });
  await page.keyboard.up("Alt");
  for (const view of everyView(page)) {
    await expect.poll(() => view.contentFrame().locator("#board > div").evaluateAll((els) => els.map((el) => Math.round(el.parentElement!.getBoundingClientRect().right - el.getBoundingClientRect().right)).sort((a, b) => a - b))).toEqual([40, 140]);
  }

  await pickTag(page);
  await dragTag(page, { x: 0, y: 256 });
  for (const view of everyView(page)) {
    await expect.poll(() => view.contentFrame().locator("#other > #tag").evaluate((el) => Math.round(el.parentElement!.getBoundingClientRect().right - el.getBoundingClientRect().right))).toBe(40);
  }
});

test("placed from the right, moved in the tablet view: it stays placed from the right there, its `right` changing at the tablet's breakpoint only; the desktop and phone views keep it where it was (line review)", async ({ page }) => {
  await addBoard(page, "top: 60px; right: 40px");
  await enterEditMode(page);
  await pickTag(page, tablet(page));
  const x = await number(page, "X");
  const views = async () => Promise.all(everyView(page).map((view) => gapsIn(view).then(({ right, top }) => ({ right, top }))));

  await dragTag(page, { x: -50, y: 0 }, { view: tablet(page) });
  const dragged = x - (await number(page, "X"));
  expect(Math.abs(dragged - 50)).toBeLessThanOrEqual(1);
  await expect.poll(views).toEqual([{ right: 40, top: 60 }, { right: 40 + dragged, top: 60 }, { right: 40, top: 60 }]);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(views).toEqual([{ right: 40, top: 60 }, { right: 41 + dragged, top: 60 }, { right: 40, top: 60 }]);

  await field(page, "X").fill(String(x - 60));
  await field(page, "X").press("Enter");
  await expect.poll(views).toEqual([{ right: 40, top: 60 }, { right: 100, top: 60 }, { right: 40, top: 60 }]);
  // Its `right` at the tablet's breakpoint: no X, and the Position row marked.
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  await expect(design(page).getByRole("region", { name: "Tablet breakpoint" }).getByRole("listitem")).toHaveText(["Right"]);
});

test("placed from the right, resized in the tablet view: its width and its `right` reset together from its Position row's mark, so it is back where it was, not moved by half of it (line review)", async ({ page }) => {
  await addBoard(page, "top: 60px; right: 40px");
  await enterEditMode(page);
  await pickTag(page, tablet(page));

  await field(page, "Width").fill("100");
  await field(page, "Width").press("Enter");
  // Its left edge stays: 20 px from the right, 100 wide, in the tablet view only.
  await expect.poll(() => gapsIn(tablet(page)).then(({ right }) => right)).toBe(20);
  await expect.poll(() => gapsIn(desktop(page)).then(({ right }) => right)).toBe(40);
  const marks = design(page).locator(".tk-row-mark");
  await expect(marks).toHaveCount(2);

  await design(page).getByRole("region", { name: "Position" }).locator(".tk-row-mark").click();
  for (const view of everyView(page)) await expect.poll(() => gapsIn(view).then(({ right }) => right)).toBe(40);
  await expect.poll(() => tablet(page).contentFrame().locator("#tag").evaluate((el) => el.getBoundingClientRect().width)).toBe(80);
  await expect(marks).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
});
