import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

/** The rows of the change list, opened from the count beside the Design title. */
async function changeRows(page: Page) {
  await page.getByRole("button", { name: /not applied yet/ }).click();
  return page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
}

/** Drags on the canvas from one point to another, in page px. */
async function drawFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

async function boxOf(locator: Locator) {
  return (await locator.boundingBox())!;
}

const HERO = '[data-testid="hero"]';

/** A Frame added to the page by hand, outside React, to draw in. */
async function addBoard(page: Page) {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0";
    document.querySelector("main")!.append(board);
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("T and a drag in a Stack make new text there, in the page's body text style, typed in at once", async ({ page }) => {
  await enterEditMode(page);
  const paragraph = await boxOf(canvas(page).locator(`${HERO} > p`));

  await page.keyboard.press("t");
  await drawFrom(page, { x: paragraph.x + 20, y: paragraph.y + paragraph.height - 2 }, { x: paragraph.x + 200, y: paragraph.y + paragraph.height + 10 });
  await page.keyboard.type("Hello there");
  await page.keyboard.press("Enter");

  expect(await canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "p", "p", "button"]);
  const text = canvas(page).locator(`${HERO} > p`).nth(1);
  await expect(text).toHaveText("Hello there");
  const body = await canvas(page).locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  await expect(text).toHaveCSS("font-family", body);
  await expect(layerTree(page).getByRole("treeitem", { name: "Hello there", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(await changeRows(page)).toHaveText([/New text.*“Hello there”/]);
});

test("the toolbar picks the same tools as V, F and T; text typed in is boxed in blue as it grows", async ({ page }) => {
  await addBoard(page);
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

  await tools.getByRole("button", { name: "Text" }).click();
  await expect(tools.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("f");
  await expect(tools.getByRole("button", { name: "Frame" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

  // Clicked in a Frame's empty space: absolute, as wide as its words.
  await tools.getByRole("button", { name: "Text" }).click();
  const board = await boxOf(canvas(page).locator("#board"));
  await drawFrom(page, { x: board.x + 20, y: board.y + 20 }, { x: board.x + 20, y: board.y + 20 });
  const box = page.locator('.vk-selection[data-kind="typing"][data-view="Desktop"]');
  await expect(box).toHaveCSS("border-color", "rgb(13, 153, 255)");
  await expect(box).toHaveCSS("border-top-width", "1px");
  const narrow = (await boxOf(box)).width;
  await page.keyboard.type("A much longer line of words");
  await expect.poll(async () => (await boxOf(box)).width).toBeGreaterThan(narrow);
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  // Drawn, the tool is put down.
  await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
});

test("F and a drag in a Frame's empty space make an absolute Frame, with no fill or outline; a button beside it writes its brief", async ({ page }) => {
  await addBoard(page);
  await enterEditMode(page);
  const board = await boxOf(canvas(page).locator("#board"));
  const zoom = await page.locator('iframe[title="Canvas"]').evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);

  await page.keyboard.press("f");
  await drawFrom(page, { x: board.x + 40 * zoom, y: board.y + 20 * zoom }, { x: board.x + 240 * zoom, y: board.y + 140 * zoom });

  const frame = canvas(page).locator("#board > div");
  const placed = await frame.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const b = el.parentElement!.getBoundingClientRect();
    return { position: getComputedStyle(el).position, x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height, fill: getComputedStyle(el).backgroundColor };
  });
  expect(placed.position).toBe("absolute");
  for (const [side, value] of [["x", 40], ["y", 20], ["width", 200], ["height", 120]] as const) expect(Math.abs(placed[side] - value)).toBeLessThanOrEqual(2);
  expect(placed.fill).toBe("rgba(0, 0, 0, 0)");

  // Beside the Frame selected, a button opens its brief; the Design panel has none.
  await expect(design(page).getByRole("textbox", { name: "Brief" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add brief" }).click();
  const brief = page.getByRole("textbox", { name: "Brief" });
  await brief.fill("A pricing table with three plans");
  await brief.press("Enter");
  await expect(brief).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Brief", exact: true })).toBeVisible();
  // No outline of its own on the canvas: a stroke will say that.
  expect(await frame.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  await expect(frame).toHaveAttribute("data-vk-brief", "A pricing table with three plans");
  // A plain Frame on the canvas, room to draw in: the brief shows in the Layers panel, not in it.
  expect(await frame.evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");
  await expect(page.locator('.vk-tree-row[aria-selected="true"] .vk-tree-brief')).toHaveAttribute("title", "Brief: A pricing table with three plans");
  await expect(await changeRows(page)).toHaveText([/New Frame.*200 × 120px, “A pricing table with three plans”/]);
});

test("a double click on the selected text types in it; the words change as an edit", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Vernier Kit", exact: true }).click();

  await canvas(page).locator("h1").dblclick();
  await page.keyboard.type("Vernier");
  await page.keyboard.press("Enter");

  await expect(canvas(page).locator("h1")).toHaveText("Vernier");
  await expect(layerTree(page).getByRole("treeitem", { name: "Vernier", exact: true })).toBeVisible();
  await expect(await changeRows(page)).toHaveText([/Text.*“Vernier Kit” → “Vernier”/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas(page).locator("h1")).toHaveText("Vernier Kit");
});

test("Delete deletes the selected layer; ⌘D copies a card of the loop beside it", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.keyboard.press("Delete");

  await expect(canvas(page).locator(`${HERO} > button`)).toBeHidden();
  await expect(layerTree(page).getByRole("treeitem", { name: "Button", exact: true })).toHaveCount(0);

  await layerTree(page).getByRole("treeitem", { name: "Card", exact: true }).nth(1).click();
  await page.keyboard.press("ControlOrMeta+d");

  expect(await canvas(page).locator("article h3").allTextContents()).toEqual(["Freeze", "Arrange", "Arrange", "Apply", "Your turn"]);
  await expect(await changeRows(page)).toHaveText([/Delete.*Button.*from Stack/, /Duplicate.*Card.*copy in Grid, 3rd/]);
});

test("⌥ held as a dragged layer is let go leaves it where it was, and puts a copy there", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const button = await boxOf(canvas(page).locator(`${HERO} > button`));
  const paragraph = await boxOf(canvas(page).locator(`${HERO} > p`));

  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(paragraph.x + paragraph.width / 2, paragraph.y + 2, { steps: 8 });
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");

  expect(await canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "button", "p", "button"]);
});

test("a copy is on the canvas only: back in preview mode, the page is as the code has it", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+d");
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await expect(page.locator(`${HERO} > button`)).toHaveCount(1);
});

test("⌘C and ⌘V paste a copy into the Stack selected; ⌘X takes a layer away at once, and ⌘V puts it there: a move", async ({ page }) => {
  await enterEditMode(page);
  const header = canvas(page).locator(`${HERO} > header`);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await layerTree(page).getByRole("treeitem", { name: "Header", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(header.locator("> button")).toHaveCount(1);

  await layerTree(page).getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(canvas(page).locator(`${HERO} > p`)).toBeHidden();
  await layerTree(page).getByRole("treeitem", { name: "Header", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(header.locator("> p")).toBeVisible();

  await expect(await changeRows(page)).toHaveText([/Duplicate.*Button/, /Move.*A Framer-style/]);
});
