import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { DOUBLE_CLICK_MS } from "../../packages/03kind/src/client/selection";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

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
  await canvasInPlace(page);
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

  await expect.poll(() => canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "p", "p", "button"]);
  const text = canvas(page).locator(`${HERO} > p`).nth(1);
  await expect(text).toHaveText("Hello there");
  const body = await canvas(page).locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  await expect(text).toHaveCSS("font-family", body);
  await expect(layerTree(page).getByRole("treeitem", { name: "Hello there", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(await changeRows(page)).toReadAs([/New text.*“Hello there”/]);
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
  const box = page.locator('.tk-selection[data-kind="typing"][data-view="Desktop"]');
  await expect(box).toHaveCSS("border-color", "rgb(0, 143, 240)");
  await expect(box).toHaveCSS("border-top-width", "1px");
  const narrow = (await boxOf(box)).width;
  await page.keyboard.type("A much longer line of words");
  await expect.poll(async () => (await boxOf(box)).width).toBeGreaterThan(narrow);
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  // Drawn, the tool is put down.
  await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
});

test("the chosen tool's backing slides to a tool clicked and jumps to one a key picks", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const backing = tools.locator(".tk-tools-backing");
  const over = async (name: string) => {
    const [a, b] = await Promise.all([backing.boundingBox(), tools.getByRole("button", { name }).boundingBox()]);
    return a !== null && b !== null && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  };
  // No motion on the first render: it starts under Select.
  expect(await over("Select")).toBe(true);
  // Motion allowed here, so the transition each change gets can be read (the config reduces it).
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await tools.getByRole("button", { name: "Frame" }).click();
  await expect(backing).toHaveCSS("transition-duration", "0.2s");
  await expect.poll(() => over("Frame")).toBe(true);
  await steadyBox(backing);
  expect(await over("Frame")).toBe(true);

  // A key: no transition, there at once.
  await page.keyboard.press("t");
  await expect(backing).toHaveCSS("transition-duration", "0s");
  expect(await over("Text")).toBe(true);

  // With reduced motion, a click jumps too.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tools.getByRole("button", { name: "Select" }).click();
  await expect(backing).toHaveCSS("transition-duration", "0s");
  expect(await over("Select")).toBe(true);
});

test("F and a drag in a Frame's empty space make an absolute Frame, with no fill or outline; the Brief tool writes its brief, on a card beside the views", async ({ page }) => {
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

  // B, and a click on the Frame: its card opens (ticket 121); nothing beside it, nor in the Design panel.
  await expect(page.getByRole("button", { name: "Add brief" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Brief" })).toHaveCount(0);
  await page.keyboard.press("b");
  const drawn = await steadyBox(frame);
  await page.mouse.click(drawn.x + drawn.width / 2, drawn.y + drawn.height / 2);
  const brief = page.getByRole("textbox", { name: "Brief" });
  await expect(brief).toBeFocused();
  await brief.fill("A pricing table with three plans");
  await brief.press("Enter");
  await expect(brief).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Brief on Frame" })).toContainText("A pricing table with three plans");
  // No outline of its own on the canvas: a stroke will say that.
  await expect.poll(() => frame.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  await expect(frame).toHaveAttribute("data-tk-brief", "A pricing table with three plans");
  // A plain Frame on the canvas, room to draw in: the brief shows in the Layers panel, not in it.
  await expect.poll(() => frame.evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");
  await expect(page.locator('.tk-tree-row[aria-selected="true"] .tk-tree-brief')).toHaveAttribute("data-tk-tip", "Brief: A pricing table with three plans");
  await expect(await changeRows(page)).toReadAs([/New Frame.*200 × 120px, “A pricing table with three plans”/]);
  await page.keyboard.press("Escape");

  // Its copy is made by the brief too: with a card of its own, and marked in the Layers panel.
  await layerTree(page).getByRole("treeitem", { name: "Frame", description: "Frame · Absolute" }).click();
  await page.keyboard.press("ControlOrMeta+d");
  const copy = canvas(page).locator("#board > div").nth(1);
  await expect(copy).toHaveAttribute("data-tk-brief", "A pricing table with three plans");
  await expect(page.locator('.tk-tree-row[aria-selected="true"] .tk-tree-brief')).toHaveAttribute("data-tk-tip", "Brief: A pricing table with three plans");
  await expect(page.locator(".tk-brief-card")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Brief on Frame" }).nth(1)).toContainText("A pricing table with three plans");
});

test("while a Frame is drawn with F, ⌘Z, ⇧⌘Z, Delete and the tool keys do nothing; let go, it is made, and ⌘Z takes it back, then the edit before it; Esc still puts the tool down", async ({ page }) => {
  await addBoard(page);
  await enterEditMode(page);
  const badge = page.getByRole("button", { name: /not applied yet/ });
  const frameTool = page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Frame" });
  // Something to undo, the title deleted, and something to redo, the paragraph deleted and that undone.
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  await page.keyboard.press("Delete");
  await layerTree(page).getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
  const title = canvas(page).locator("h1");
  const paragraph = canvas(page).locator(`${HERO} > p`);
  await expect(title).toBeHidden();
  await expect(paragraph).toBeVisible();
  const board = await boxOf(canvas(page).locator("#board"));
  const made = canvas(page).locator("#board > div");

  await page.keyboard.press("f");
  await page.mouse.move(board.x + 20, board.y + 20);
  await page.mouse.down();
  await page.mouse.move(board.x + 120, board.y + 80, { steps: 6 });
  for (const key of ["ControlOrMeta+z", "ControlOrMeta+Shift+z", "Delete", "t", "v"]) {
    await page.keyboard.press(key);
    await expect(title, key).toBeHidden();
    await expect(paragraph, key).toBeVisible();
    await expect(badge, key).toHaveAccessibleName("1 change not applied yet");
    await expect(frameTool, key).toHaveAttribute("aria-pressed", "true");
  }
  await page.mouse.up();
  await expect(made).toHaveCount(1);
  await expect(badge).toHaveAccessibleName("2 changes not applied yet");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(made).toHaveCount(0);
  await expect(title).toBeHidden();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(title).toBeVisible();

  await page.keyboard.press("f");
  await page.mouse.move(board.x + 20, board.y + 20);
  await page.mouse.down();
  await page.mouse.move(board.x + 120, board.y + 80, { steps: 6 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(made).toHaveCount(0);
});

test("while text is drawn with T, ⌘Z, ⇧⌘Z, Delete, Enter and the tool keys do nothing; let go, it is made and typed in, and ⌘Z takes back its words, it, then the edit before it", async ({ page }) => {
  await enterEditMode(page);
  const badge = page.getByRole("button", { name: /not applied yet/ });
  const textTool = page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Text" });
  // Something to undo, the title deleted, and something to redo, the button deleted and that undone.
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  await page.keyboard.press("Delete");
  await layerTree(page).getByRole("treeitem", { name: "Get started", exact: true }).click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
  const title = canvas(page).locator("h1");
  const button = canvas(page).locator(`${HERO} > button`);
  await expect(title).toBeHidden();
  await expect(button).toBeVisible();
  const paragraph = await boxOf(canvas(page).locator(`${HERO} > p`));
  const kinds = () => canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName));
  const before = await kinds();

  await page.keyboard.press("t");
  await page.mouse.move(paragraph.x + 20, paragraph.y + paragraph.height - 2);
  await page.mouse.down();
  await page.mouse.move(paragraph.x + 200, paragraph.y + paragraph.height + 10, { steps: 6 });
  for (const key of ["ControlOrMeta+z", "ControlOrMeta+Shift+z", "Delete", "Enter", "f", "v"]) {
    await page.keyboard.press(key);
    await expect(title, key).toBeHidden();
    await expect(button, key).toBeVisible();
    await expect.poll(() => kinds(), key).toEqual(before);
    await expect(badge, key).toHaveAccessibleName("1 change not applied yet");
    await expect(textTool, key).toHaveAttribute("aria-pressed", "true");
  }
  await page.mouse.up();
  await page.keyboard.type("Hello there");
  await page.keyboard.press("Enter");
  const made = canvas(page).locator(`${HERO} > p`).nth(1);
  await expect(made).toHaveText("Hello there");
  await expect(badge).toHaveAccessibleName("2 changes not applied yet");

  // The words typed are an edit of their own, undone first; then the new text, then the title deleted before it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(made).toHaveText("Text");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(made).toHaveCount(0);
  await expect(title).toBeHidden();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(title).toBeVisible();
  await expect(button).toBeVisible();
});

test("a double click on the selected text types in it; the words change as an edit", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).click();

  await canvas(page).locator("h1").dblclick();
  await page.keyboard.type("Third");
  await page.keyboard.press("Enter");

  await expect(canvas(page).locator("h1")).toHaveText("Third");
  await expect(layerTree(page).getByRole("treeitem", { name: "Third", exact: true })).toBeVisible();
  await expect(await changeRows(page)).toReadAs([/Text.*“Third Kind” → “Third”/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas(page).locator("h1")).toHaveText("Third Kind");
});

/** Types in the h1 "Third Kind", double-clicked once selected; then waits, so the next press makes no double click with it. */
async function typeInHeading(page: Page) {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Third Kind", exact: true }).click();
  await canvas(page).locator("h1").dblclick();
  await expect(canvas(page).locator("h1")).toHaveAttribute("contenteditable", "plaintext-only");
  await page.waitForTimeout(DOUBLE_CLICK_MS);
}

/** What is selected in the canvas, as the page reads it. */
function selectedText(page: Page) {
  return canvas(page)
    .locator("h1")
    .evaluate((h1) => h1.ownerDocument.getSelection()!.toString());
}

test("while text is typed in, a double click on a word selects it, and typing goes on", async ({ page }) => {
  await typeInHeading(page);
  const box = await steadyBox(canvas(page).locator("h1"));

  await page.mouse.dblclick(box.x + box.width * 0.1, box.y + box.height / 2);

  await expect.poll(() => selectedText(page)).toBe("Third");
  await expect(canvas(page).locator("h1")).toHaveAttribute("contenteditable", "plaintext-only");
  await page.keyboard.type("Fourth");
  await expect(canvas(page).locator("h1")).toHaveText("Fourth Kind");
});

test("while text is typed in, a click in it places the caret there, and typing goes on from there", async ({ page }) => {
  await typeInHeading(page);
  const box = await steadyBox(canvas(page).locator("h1"));
  await expect.poll(() => selectedText(page)).toBe("Third Kind");

  // Past the end of the words, on their line: the caret goes after them.
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);

  await expect.poll(() => selectedText(page)).toBe("");
  await expect(canvas(page).locator("h1")).toHaveAttribute("contenteditable", "plaintext-only");
  await page.keyboard.type("!");
  await expect(canvas(page).locator("h1")).toHaveText("Third Kind!");
  await page.keyboard.press("Enter");
  await expect(canvas(page).locator("h1")).not.toHaveAttribute("contenteditable");
  await expect(canvas(page).locator("h1")).toHaveText("Third Kind!");
});

test("while text is typed in, a click outside it ends typing and sets the words as an edit", async ({ page }) => {
  await typeInHeading(page);
  await page.keyboard.type("Third");
  const box = await steadyBox(canvas(page).locator("h1"));

  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 40);

  await expect(canvas(page).locator("h1")).not.toHaveAttribute("contenteditable");
  await expect(canvas(page).locator("h1")).toHaveText("Third");
  await expect(await changeRows(page)).toReadAs([/Text.*“Third Kind” → “Third”/]);
});

test("Delete deletes the selected layer; ⌘D copies a card of the loop beside it", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.keyboard.press("Delete");

  await expect(canvas(page).locator(`${HERO} > button`)).toBeHidden();
  await expect(layerTree(page).getByRole("treeitem", { name: "Button", exact: true })).toHaveCount(0);

  await layerTree(page).getByRole("treeitem", { name: "Card", exact: true }).nth(1).click();
  await page.keyboard.press("ControlOrMeta+d");

  await expect.poll(() => canvas(page).locator("article h3").allTextContents()).toEqual(["Freeze", "Arrange", "Arrange", "Apply", "Your turn"]);
  await expect(await changeRows(page)).toReadAs([/Delete.*Button.*from Stack/, /Duplicate.*Card.*copy in Grid, 3rd/]);
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

  await expect.poll(() => canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "button", "p", "button"]);
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

  await expect(await changeRows(page)).toReadAs([/Duplicate.*Button/, /Move.*A Framer-style/]);
});
