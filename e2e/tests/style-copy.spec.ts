import { canvasInPlace, steadyBox, expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

// ⌥⌘C and ⌥⌘V copy a layer's style and paste it, inside the editor, as Figma's Copy properties and Paste properties (ticket 117).

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const views = (page: Page) => [desktop(page), page.locator('iframe[title="Tablet 768"]'), phone(page)];
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers" });

const WHITE = "rgb(255, 255, 255)";
const RED = "rgb(255, 0, 0)";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await layers(page).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/** Selects, in a view, the deepest layer just inside the top left of what `selector` finds: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = await steadyBox(view.contentFrame().locator(selector).first());
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of every card on the canvas, in page order: three of one usage, then "Your turn". */
function cards(page: Page, property: "backgroundColor" | "borderTopLeftRadius" | "width") {
  return desktop(page)
    .contentFrame()
    .locator("article")
    .evaluateAll((els, property) => els.map((el) => getComputedStyle(el)[property]), property);
}

/** The computed `property` of the first card, in each view: desktop, tablet, phone. */
function firstCard(page: Page, property: string) {
  return Promise.all(views(page).map((view) => view.contentFrame().locator("article").first().evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property)));
}

const copyStyle = (page: Page) => page.keyboard.press("Alt+ControlOrMeta+KeyC");
const pasteStyle = (page: Page) => page.keyboard.press("Alt+ControlOrMeta+KeyV");

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await enterEditMode(page);
});

test("⌥⌘C copies a card's look, ⌥⌘V puts it on every card of another usage, its size as it was; ⌘Z takes the paste back in one step", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "4");
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, RED]);
  const widths = await cards(page, "width");
  await selectRow(page, "Card", 3);
  await copyStyle(page);

  await selectRow(page, "Card", 0);
  await pasteStyle(page);
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([RED, RED, RED, RED]);
  await expect.poll(() => cards(page, "borderTopLeftRadius")).toEqual(["4px", "4px", "4px", "4px"]);
  expect(await cards(page, "width")).toEqual(widths);
  // The panel shows the values pasted, as if typed there.
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FF0000");

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, RED]);
  await expect.poll(() => cards(page, "borderTopLeftRadius")).toEqual(["12px", "12px", "12px", "4px"]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([RED, RED, RED, RED]);
});

test("pasted in the phone view, the style is the phone view's alone, marked as changed there", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await setField(page, "Fill color", "ff0000");
  // Out of the field, which keeps its keys.
  await selectRow(page, "Card", 3);
  await copyStyle(page);

  await pick(page, phone(page), "article");
  await pasteStyle(page);
  await expect.poll(() => firstCard(page, "background-color")).toEqual([WHITE, WHITE, RED]);
  await expect(design(page).getByRole("button", { name: "Reset fill" })).toBeVisible();
});

test("while the pointer is held down on a layer, ⌥⌘V does nothing; let go, it pastes", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await setField(page, "Fill color", "ff0000");
  // Out of the field, which keeps its keys.
  await selectRow(page, "Card", 3);
  await copyStyle(page);
  await selectRow(page, "Card", 0);

  const box = await steadyBox(desktop(page).contentFrame().locator("article").first());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
  await page.mouse.down();
  await pasteStyle(page);
  await page.mouse.up();
  // Nothing came of it, then or later.
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, RED]);

  await selectRow(page, "Card", 0);
  await pasteStyle(page);
  await expect.poll(() => cards(page, "backgroundColor")).toEqual([RED, RED, RED, RED]);
});
