import { DEV_URL, REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

// Ticket 119: the Design panel shows the Variable the code writes a value with, as one picked shows, though nothing is
// changed; ⌥⌘C and ⌥⌘V carry it. On the React 18 + Tailwind v3 example: its classes name its config's Variables.

// The names the code writes with are what is tested here: they stay.
test.use({ detachCodeVariables: false });

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers" });
const chip = (page: Page, name: string) => design(page).getByRole("button", { name: `${name} variable`, exact: true });
/** The count of changes beside the toggle: there only once there are changes. */
const changesOpener = (page: Page) => page.locator("[data-tk-changes-opener]");

async function enterEditMode(page: Page, url = REACT18_URL) {
  await page.goto(url);
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

test("a card shows the Variables its classes write its values with, by name, and nothing is changed", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");

  // `rounded-card border border-brand-100 bg-white p-gutter shadow-card`: the config's, and Tailwind's `white`.
  await expect(chip(page, "Fill color")).toHaveText("white");
  await expect(chip(page, "Corner radius")).toHaveText("card");
  for (const side of ["top", "right", "bottom", "left"]) await expect(chip(page, `Padding ${side}`)).toHaveText("gutter");
  await expect(chip(page, "Stroke color")).toHaveText("brand-100");
  // Shown as a Variable picked, but not marked changed, and no change is recorded.
  await expect(design(page).locator(".tk-variable-chip.is-changed")).toHaveCount(0);
  await expect(changesOpener(page)).toHaveCount(0);

  // Its title: `text-lead text-ink`.
  await pick(page, desktop(page), "article h3");
  await expect(chip(page, "Font size")).toHaveText("lead");
  await expect(chip(page, "Fill color")).toHaveText("ink");
  await expect(changesOpener(page)).toHaveCount(0);
});

test("detached, a code's Variable shows the value to type into; a value typed is a change, named as before", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await design(page).getByRole("button", { name: "Detach corner radius variable", exact: true }).click();
  const radius = design(page).getByRole("textbox", { name: "Corner radius", exact: true });
  await expect(radius).toHaveValue("14");
  // Detaching alone changes nothing: the code keeps its Variable.
  await expect(changesOpener(page)).toHaveCount(0);
  await radius.fill("20");
  await radius.press("Enter");
  await expect(changesOpener(page)).toHaveAccessibleName("1 change not applied yet");
  await expect(radius).toHaveValue("20");
  // The other fields still show the code's.
  await expect(chip(page, "Fill color")).toHaveText("white");

  // Selected again, the value changed is no Variable of the code's.
  await selectRow(page, "Card", 1);
  await selectRow(page, "Card");
  await expect(radius).toHaveValue("20");
});

test("in the phone view, the class that holds at its width: `px-gutter md:px-section`", async ({ page }) => {
  await enterEditMode(page);
  // The main column, picked in its left padding: in the desktop view, 1440px wide, `md:px-section`.
  await pick(page, desktop(page), "main");
  await expect(chip(page, "Padding left")).toHaveText("section");
  // In the phone view, 390px wide: below `md` (820px).
  await pick(page, phone(page), "main");
  await expect(chip(page, "Padding left")).toHaveText("gutter");
  await expect(chip(page, "Padding right")).toHaveText("gutter");
  await expect(changesOpener(page)).toHaveCount(0);
});

test("⌥⌘C carries the Variables the code writes, ⌥⌘V sets them: pasted, the fill is `white` still", async ({ page }) => {
  await enterEditMode(page);
  // The hero's button: `bg-brand-500`.
  await selectRow(page, "Button");
  await expect(chip(page, "Fill color")).toHaveText("brand-500");
  await page.keyboard.press("Alt+ControlOrMeta+KeyC");

  await selectRow(page, "Card");
  await page.keyboard.press("Alt+ControlOrMeta+KeyV");
  await expect.poll(() => desktop(page).contentFrame().locator("article").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(61, 99, 245)");
  await expect(chip(page, "Fill color")).toHaveText("brand-500");
  await expect(chip(page, "Fill color")).toHaveAttribute("data-tk-tip", "brand-500: #3d63f5");
});

test("on a Tailwind v4 project, a class writes its theme's Variable through `var()`: the header's `gap-3`, the button's `px-4`", async ({ page }) => {
  await enterEditMode(page, DEV_URL);
  await pick(page, desktop(page), "header");
  await expect(chip(page, "Gap")).toHaveText("3");
  await pick(page, desktop(page), "[data-testid=hero] button");
  await expect(chip(page, "Padding left")).toHaveText("4");
  await expect(chip(page, "Padding top")).toHaveText("2");
  await expect(changesOpener(page)).toHaveCount(0);
});
