import { expect, test, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { DOUBLE_CLICK_MS } from "../../packages/03kind/src/client/selection";

/**
 * A button with only text in it that draws a box (ticket 56): a Frame, with a
 * text layer in it, as a button is in Figma. The Dialog's Close button.
 */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

function row(page: Page, name: string) {
  return layerTree(page).getByRole("treeitem", { name, exact: true });
}

function selectedRow(page: Page) {
  return layerTree(page).getByRole("treeitem", { selected: true });
}

/** The Close button on the canvas. */
function close(page: Page) {
  return canvas(page).getByRole("dialog", { name: "Ship it?" }).getByRole("button");
}

/** A computed style of the Close button on the canvas. */
function closeStyle(page: Page, property: "backgroundColor" | "borderTopWidth" | "borderTopStyle" | "borderTopLeftRadius" | "paddingTop" | "fontSize" | "color") {
  return close(page).evaluate((el, property) => getComputedStyle(el)[property], property);
}

/** The rows of the change list, opened from the count beside the Design title. */
async function changeRows(page: Page) {
  await page.getByRole("button", { name: /not applied yet/ }).click();
  return page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
}

/** Types `value` into the Design panel's field `name`, and Enter. */
async function type(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  // Frozen with the Dialog open.
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(close(page)).toBeVisible();
});

test("the Dialog's Close button is a Frame named Button, with its words a text layer in it", async ({ page }) => {
  await row(page, "Close").click();
  await expect(selectedRow(page)).toHaveAttribute("aria-description", "Text");
  await page.keyboard.press("Escape");

  await expect(selectedRow(page)).toHaveText("Button");
  await expect(selectedRow(page)).toHaveAttribute("aria-description", "Frame");
  await expect(design(page)).not.toContainText("Text styles apply");
});

test("the Close button takes a background, a border, corners and padding of its own, as a Frame does, and has no text styles", async ({ page }) => {
  await row(page, "Close").click();
  await page.keyboard.press("Escape");
  // Tailwind's `py-1.5`, read as it is.
  await expect(design(page).getByRole("textbox", { name: "Padding top", exact: true })).toHaveValue("6");
  await expect(design(page).getByRole("group", { name: "Text" })).toHaveCount(0);

  await type(page, "Fill color", "1c1917");
  await design(page).getByRole("group", { name: "Stroke" }).getByRole("button", { name: "Add stroke" }).click();
  await type(page, "Corner radius", "8");
  await type(page, "Padding top", "10");

  await expect.poll(() => closeStyle(page, "backgroundColor")).toBe("rgb(28, 25, 23)");
  await expect.poll(async () => [await closeStyle(page, "borderTopStyle"), await closeStyle(page, "borderTopWidth")]).toEqual(["solid", "1px"]);
  await expect.poll(() => closeStyle(page, "borderTopLeftRadius")).toBe("8px");
  await expect.poll(() => closeStyle(page, "paddingTop")).toBe("10px");
  await expect(await changeRows(page)).toReadAs([/Fill.*Button/, /Stroke.*Button/, /Corner radius.*Button/, /Padding.*Button/]);
});

test("the text in it takes its text styles on the button itself, with no element put around the words", async ({ page }) => {
  await row(page, "Close").click();
  const fill = design(page).getByRole("group", { name: "Fill" });
  await expect(fill.getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FFFFFF");
  await expect(design(page)).toContainText("The text of Button: its text styles are written on Button itself.");
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);

  await type(page, "Font size", "18");

  await expect.poll(() => closeStyle(page, "fontSize")).toBe("18px");
  await expect.poll(() => close(page).evaluate((el) => el.childElementCount)).toBe(0);
  await expect(selectedRow(page)).toHaveText("Close");
  await expect(await changeRows(page)).toReadAs([/Font size.*Close/]);
  await page.keyboard.press("Escape");

  // Undone, the text is still the one selected.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => closeStyle(page, "fontSize")).toBe("14px");
  await expect(selectedRow(page)).toHaveText("Close");
});

test("a click on the Close button selects it; a double click types in its words", async ({ page }) => {
  await row(page, "Ship it?").click();
  const box = (await close(page).boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
  await expect(selectedRow(page)).toHaveText("Button");

  // A press this soon after the click, as near on the canvas zoomed out, would make a double click of the two.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("Done");
  await page.keyboard.press("Enter");

  await expect(close(page)).toHaveText("Done");
  await expect.poll(() => close(page).evaluate((el) => el.childElementCount)).toBe(0);
  await expect(selectedRow(page)).toHaveText("Done");
  await expect(await changeRows(page)).toReadAs([/Text.*“Close” → “Done”/]);
});
