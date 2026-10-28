import { expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const views = (page: Page) => [desktop(page), tablet(page), phone(page)];
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers" });

const WHITE = "rgb(255, 255, 255)";
const RED = "rgb(255, 0, 0)";
const BLUE = "rgb(37, 99, 235)";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
}

/** Selects, in a view, the deepest layer just inside the top left of what `selector` finds: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** The computed `property` of the first element `selector` finds, in each view: desktop, tablet, phone. */
function shown(page: Page, selector: string, property: string) {
  return Promise.all(
    views(page).map((view) => view.contentFrame().locator(selector).first().evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property)),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a property changed in the phone view changes the phone view only; one changed in the desktop view changes every view but where a breakpoint changed it", async ({ page }) => {
  await enterEditMode(page);

  await pick(page, phone(page), "article");
  await setField(page, "Fill color", "ff0000");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, WHITE, RED]);
  // The panel shows the phone view's values.
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FF0000");

  await pick(page, desktop(page), "article");
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FFFFFF");
  await setField(page, "Fill color", "2563eb");
  await setField(page, "Corner radius", "4");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([BLUE, BLUE, RED]);
  await expect.poll(() => shown(page, "article", "border-top-left-radius")).toEqual(["4px", "4px", "4px"]);
});

test("the panel marks the properties the breakpoint changed on its own; reset, they inherit again, and the panel shows it", async ({ page }) => {
  await enterEditMode(page);

  await pick(page, phone(page), "article");
  const section = design(page).getByRole("region", { name: "Phone breakpoint" });
  // Tailwind's own breakpoints, which the example keeps: the phone is below `sm`.
  await expect(section).toContainText("below 640px");
  await expect(section).toContainText("max-sm:");
  await expect(section.getByRole("listitem")).toHaveCount(0);
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "4");
  await expect(section.getByRole("listitem")).toHaveText(["Fill", "Corner radius"]);

  // Not changed on its own at every width: the desktop view has no breakpoint to mark.
  await pick(page, desktop(page), "article");
  await expect(design(page).getByRole("region", { name: /breakpoint/ })).toHaveCount(0);
  await setField(page, "Fill color", "2563eb");

  await pick(page, phone(page), "article");
  await section.getByRole("button", { name: "Reset Fill to inherit" }).click();
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([BLUE, BLUE, BLUE]);
  await expect(section.getByRole("listitem")).toHaveText(["Corner radius"]);
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("2563EB");

  // ⌘Z brings the phone's own fill back, as the change it was.
  await page.keyboard.press("Meta+z");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([BLUE, BLUE, RED]);
  await expect(section.getByRole("listitem")).toHaveText(["Fill", "Corner radius"]);
});

test("each view stands for the range of the project's Tailwind breakpoints its width is in, and its label says which; adding a view changes no range", async ({ page }) => {
  await enterEditMode(page);
  const label = (name: string) => page.getByRole("group", { name: `${name} view` });
  await expect(label("Tablet")).toContainText("md:max-lg:");
  await expect(label("Phone")).toContainText("max-sm:");
  await expect(label("Desktop")).not.toContainText(":");

  // A view of 500px is in the phone's range, `sm` being 640px: an edit in either shows in both.
  await page.getByRole("button", { name: "Add view" }).click();
  await page.getByRole("spinbutton", { name: "New view width" }).fill("500");
  await page.getByRole("spinbutton", { name: "New view width" }).press("Enter");
  const custom = page.locator('iframe[title="Custom 500"]');
  await expect(custom.contentFrame().locator("h1")).toBeVisible();
  await expect(label("Custom")).toContainText("max-sm:");
  // Every view in sight again (⇧1).
  await page.keyboard.press("Shift+Digit1");

  await pick(page, phone(page), "article");
  await expect(design(page).getByRole("region", { name: "Phone breakpoint" })).toContainText("below 640px");
  await setField(page, "Fill color", "ff0000");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, WHITE, RED]);
  await expect(custom.contentFrame().locator("article").first()).toHaveCSS("background-color", RED);
  // Told and reset in the other view of the range too.
  await pick(page, custom, "article");
  const section = design(page).getByRole("region", { name: "Custom breakpoint" });
  await expect(section.getByRole("listitem")).toHaveText(["Fill"]);
  await section.getByRole("button", { name: "Reset Fill to inherit" }).click();
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, WHITE, WHITE]);
});

test("a layer hidden at a breakpoint is hidden in that view only, and stays in the layer tree", async ({ page }) => {
  await enterEditMode(page);
  const hero = '[data-testid="hero"] > button';

  await pick(page, phone(page), hero);
  await expect(layers(page).getByRole("treeitem", { selected: true })).toHaveText("Button");
  await design(page).getByRole("checkbox", { name: "Visible" }).uncheck();

  await expect.poll(() => shown(page, hero, "display")).toEqual(["flex", "flex", "none"]);
  await expect(layers(page).getByRole("treeitem", { name: "Button", exact: true })).toBeVisible();
  await expect(design(page).getByRole("region", { name: "Phone breakpoint" }).getByRole("listitem")).toHaveText(["Visibility"]);

  // Selected from the tree, it is still the phone view worked in: shown again there.
  await layers(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await design(page).getByRole("checkbox", { name: "Visible" }).check();
  await expect.poll(() => shown(page, hero, "display")).toEqual(["flex", "flex", "flex"]);
});

test("changes to the structure made in the phone view change all three views at once", async ({ page }) => {
  await enterEditMode(page);
  const count = () => Promise.all(views(page).map((view) => view.contentFrame().locator("article:visible").count()));
  expect(await count()).toEqual([4, 4, 4]);

  await pick(page, phone(page), "article");
  await page.keyboard.press("Meta+d");
  await expect.poll(count).toEqual([5, 5, 5]);
  await pick(page, phone(page), "article:last-child");
  await page.keyboard.press("Delete");
  await expect.poll(count).toEqual([4, 4, 4]);
  await expect.poll(() => Promise.all(views(page).map((view) => view.contentFrame().locator("article:visible", { hasText: "Your turn" }).count()))).toEqual([0, 0, 0]);
});

test("the change list says the breakpoint of each change made in a narrower view", async ({ page }) => {
  await enterEditMode(page);

  await pick(page, phone(page), "article");
  await setField(page, "Fill color", "ff0000");
  await pick(page, tablet(page), "article");
  await setField(page, "Corner radius", "4");
  await pick(page, desktop(page), "article");
  await setField(page, "Opacity", "50");

  await page.locator("[data-vk-changes-opener]").click();
  const list = page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
  await expect(list.nth(0)).toContainText("below 640px");
  await expect(list.nth(1)).toContainText("768px to 1023px");
  await expect(list.nth(2)).not.toContainText("px to");
});
