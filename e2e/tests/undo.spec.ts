import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

const RED = "rgb(255, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function backToPreviewMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of every card, on the canvas in edit mode, on the live page otherwise. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius", where: "canvas" | "page") {
  const cards = where === "canvas" ? canvas(page).locator("article") : page.locator("article");
  return cards.evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const changeList = (page: Page) => page.getByRole("dialog", { name: "Changes" });

/** The cards of the loop: red, then corner radius 2px. The Get started button: blue. Three changes. */
async function makeThreeChanges(page: Page) {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await selectRow(page, "Button");
  await setField(page, "Fill color", "2563eb");
  await expect(badge(page)).toHaveText("3");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("⌘Z and ⇧⌘Z go back and forth through the edits, across layers, on the canvas and the badge alike", async ({ page }) => {
  await makeThreeChanges(page);
  const button = canvas(page).getByRole("button", { name: "Get started" });
  // Out of the field, as after a click on the canvas.
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).blur();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(badge(page)).toHaveText("2");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await cardStyles(page, "borderRadius", "canvas")).toEqual(["12px", "12px", "12px", "12px"]);
  // The panel shows the layer the edit is undone on.
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveValue("12");
  await expect(badge(page)).toHaveText("1");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(badge(page)).toHaveText("2");
});

test("a drag on a number's icon is undone as a whole", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const icon = page.locator('.vk-field:has([aria-label="Corner radius"]) .vk-scrub');
  const { x, y } = (await icon.boundingBox())!;
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + 4 + i, y + 4);
  await page.mouse.up();
  await expect(radius).toHaveValue("17");

  await page.keyboard.press("ControlOrMeta+z");

  await expect(radius).toHaveValue("12");
  await expect(badge(page)).toHaveCount(0);
});

test("while a value is being typed, ⌘Z is the field's own; once applied, ⌘Z undoes the edit though the field keeps focus", async ({ page }) => {
  await makeThreeChanges(page);
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  const button = canvas(page).getByRole("button", { name: "Get started" });

  await hex.fill("00ff00");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await expect(badge(page)).toHaveText("3");

  await hex.press("Escape");
  await hex.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(hex).toHaveValue("DC2626");
});

test("several layers edited together go back together with ⌘Z, the focus still in the field just typed in", async ({ page }) => {
  await enterEditMode(page);
  const css = () =>
    canvas(page)
      .locator('[data-testid="hero"]')
      .evaluate((hero) => {
        const [header, , button] = [...hero.children] as HTMLElement[];
        const of = (el: HTMLElement) => ({ style: el.style.cssText, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height });
        return [of(header), of(button)];
      });
  await selectRow(page, "Header");
  const before = await css();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click({ modifiers: ["Shift"] });
  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();

  await design(page).getByRole("checkbox", { name: "Distribute evenly" }).check();
  await setField(page, "Width", "120");
  await setField(page, "Gap", "30");
  await expect(badge(page)).toHaveText("6");

  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+z");

  await expect(badge(page)).toHaveCount(0);
  expect(await css()).toEqual(before);
});

test("in edit mode, an X beside the Design title goes back to preview mode, and the change count beside it opens the change list", async ({ page }) => {
  await makeThreeChanges(page);
  // No toggle floats over the canvas meanwhile.
  await expect(page.locator(".vk-dock")).toHaveCount(0);

  const count = design(page).getByRole("button", { name: "3 changes not applied yet" });
  await expect(count).toHaveText("3");
  await count.click();
  await expect(changeList(page).getByRole("listitem")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(changeList(page)).toHaveCount(0);
  await expect(count).toBeFocused();

  await design(page).getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(badge(page)).toHaveText("3");
});

test("the badge opens the change list, where each change can be undone on its own; ⌘Z brings it back", async ({ page }) => {
  await makeThreeChanges(page);

  await badge(page).click();
  const list = changeList(page);
  await expect(list.getByRole("listitem")).toHaveText([/Fill.*Card.*#FFFFFF → #FF0000/, /Corner radius.*Card.*12px → 2px/, /Fill.*Button.*#DC2626 → #2563EB/]);
  await list.getByRole("button", { name: "Undo the corner radius of Card" }).click();

  expect(await cardStyles(page, "borderRadius", "canvas")).toEqual(["12px", "12px", "12px", "12px"]);
  expect(await cardStyles(page, "backgroundColor", "canvas")).toEqual([RED, RED, RED, WHITE]);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(badge(page)).toHaveText("2");

  await page.keyboard.press("ControlOrMeta+z");
  expect(await cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(list.getByRole("listitem")).toHaveCount(3);
});

test("in preview mode, undoing a change from the list takes it off the live page at once; the list opens from the keyboard too", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  expect(await cardStyles(page, "backgroundColor", "page")).toEqual([RED, RED, RED, WHITE]);

  await badge(page).focus();
  await page.keyboard.press("Enter");
  const list = changeList(page);
  await expect(list).toBeVisible();
  await list.getByRole("button", { name: "Undo the fill of Card" }).click();

  expect(await cardStyles(page, "backgroundColor", "page")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  expect(await cardStyles(page, "borderRadius", "page")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(badge(page)).toHaveText("2");

  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(badge(page)).toBeFocused();

  // The canvas comes back without it.
  await enterEditMode(page);
  expect(await cardStyles(page, "backgroundColor", "canvas")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  expect(await cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
});

test("after a reload there is nothing to undo with ⌘Z, but the change list still undoes each change", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await page.reload();
  await expect(badge(page)).toHaveText("3");

  await enterEditMode(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("3");

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the fill of Button" }).click();
  await expect(canvas(page).getByRole("button", { name: "Get started" })).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(badge(page)).toHaveText("2");
});

test("Discard all asks first; once confirmed, the changes and the canvas are gone, and edit mode freezes the page afresh", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await badge(page).click();
  const list = changeList(page);

  await list.getByRole("button", { name: "Discard all" }).click();
  await expect(list.getByText("Discard all 3 changes?")).toBeVisible();
  await list.getByRole("button", { name: "Cancel" }).click();
  await expect(badge(page)).toHaveText("3");

  await list.getByRole("button", { name: "Discard all" }).click();
  await list.getByRole("button", { name: "Discard", exact: true }).click();

  await expect(badge(page)).toHaveCount(0);
  await expect(list).toHaveCount(0);
  expect(await cardStyles(page, "backgroundColor", "page")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await expect(page.getByRole("radiogroup", { name: "Change Preview" })).toHaveCount(0);
  // A page state the old canvas was not frozen in.
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  expect(await cardStyles(page, "backgroundColor", "canvas")).toEqual([WHITE, WHITE, WHITE, WHITE]);
});

test("Discard all in edit mode goes back to preview mode, with nothing changed", async ({ page }) => {
  await makeThreeChanges(page);

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Discard all" }).click();
  await changeList(page).getByRole("button", { name: "Discard", exact: true }).click();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  expect(await cardStyles(page, "backgroundColor", "page")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await page.waitForTimeout(700); // Past the autosave delay: nothing left to save.
  await page.reload();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
});
