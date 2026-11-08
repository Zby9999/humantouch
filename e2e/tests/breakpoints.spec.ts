import { canvasInPlace, steadyBox, expect, test, type Locator, type Page } from "./fixtures";
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
  await canvasInPlace(page);
}

/** A view's label says the widths it covers, and, in their tip, the project's variant they are written with, if any. */
async function expectRange(page: Page, name: string, widths: string, variant?: string) {
  const range = page.getByRole("group", { name: `${name} view` }).locator(".tk-view-range");
  await expect(range).toHaveText(widths);
  if (variant) await expect(range).toHaveAttribute("data-tk-tip", new RegExp(`breakpoint ${variant}`));
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
  // Tailwind's own breakpoints, which the example keeps: the phone reaches up to `md`, where the tablet's range starts.
  await expect(section).toContainText("below 768px");
  await expect(section).toContainText("max-md:");
  // Marked on their fields, each with its reset; not listed at the breakpoint too (designer, 2026-11-07).
  const resetFill = design(page).getByRole("button", { name: "Reset fill" });
  const resetRadius = design(page).getByRole("button", { name: "Reset corner radius" });
  await expect(resetFill).toHaveCount(0);
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "4");
  await expect(resetFill).toBeVisible();
  await expect(resetRadius).toBeVisible();
  await expect(section.getByRole("list")).toHaveCount(0);

  // Not changed on its own at every width: the desktop view has no breakpoint to mark.
  await pick(page, desktop(page), "article");
  await expect(design(page).getByRole("region", { name: /breakpoint/ })).toHaveCount(0);
  await setField(page, "Fill color", "2563eb");

  await pick(page, phone(page), "article");
  await resetFill.click();
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([BLUE, BLUE, BLUE]);
  await expect(resetFill).toHaveCount(0);
  await expect(resetRadius).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("2563EB");

  // ⌘Z brings the phone's own fill back, as the change it was.
  await page.keyboard.press("Meta+z");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([BLUE, BLUE, RED]);
  await expect(resetFill).toBeVisible();
});

test("in the tablet view, a property the breakpoint changed on its own is marked on its field, and reset there it inherits the desktop view's value; the desktop view marks none", async ({ page }) => {
  await enterEditMode(page);

  await pick(page, tablet(page), "article");
  const reset = design(page).getByRole("button", { name: "Reset fill" });
  await expect(reset).toHaveCount(0);
  await setField(page, "Fill color", "ff0000");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, RED, WHITE]);
  await expect(reset).toBeVisible();

  // The desktop view has no change of its own to mark.
  await pick(page, desktop(page), "article");
  await expect(reset).toHaveCount(0);

  await pick(page, tablet(page), "article");
  await reset.click();
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, WHITE, WHITE]);
  await expect(reset).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FFFFFF");

  // One undo brings the tablet's own fill back, marked again.
  await page.keyboard.press("Meta+z");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, RED, WHITE]);
  await expect(reset).toBeVisible();
});

test("each view stands for the range of the project's Tailwind breakpoints its width is in and those above it up to the next view's, and its label says which; a view added in the same range shares it", async ({ page }) => {
  await enterEditMode(page);
  const label = (name: string) => page.getByRole("group", { name: `${name} view` });
  // The desktop view, 1280px wide, is from `xl` up. The label says the widths; the variant is in its title (designer, 2026-11-08).
  await expectRange(page, "Tablet", "768–1279", "md:max-xl:");
  await expectRange(page, "Phone", "≤ 767", "max-md:");
  await expectRange(page, "Desktop", "≥ 1280");
  await expect(label("Desktop")).not.toContainText(":");

  // A view of 500px is in the phone's range, `sm` being 640px: an edit in either shows in both.
  await page.getByRole("button", { name: "Add view" }).click();
  await page.getByRole("spinbutton", { name: "New view width" }).fill("500");
  await page.getByRole("spinbutton", { name: "New view width" }).press("Enter");
  const custom = page.locator('iframe[title="Custom 500"]');
  await expect(custom.contentFrame().locator("h1")).toBeVisible();
  await expectRange(page, "Custom", "≤ 767", "max-md:");
  // Every view in sight again (⇧1).
  await page.keyboard.press("Shift+Digit1");

  await pick(page, phone(page), "article");
  await expect(design(page).getByRole("region", { name: "Phone breakpoint" })).toContainText("below 768px");
  await setField(page, "Fill color", "ff0000");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, WHITE, RED]);
  await expect(custom.contentFrame().locator("article").first()).toHaveCSS("background-color", RED);
  // Told and reset in the other view of the range too.
  await pick(page, custom, "article");
  await expect(design(page).getByRole("region", { name: "Custom breakpoint" })).toBeVisible();
  await design(page).getByRole("button", { name: "Reset fill" }).click();
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
  // Marked; checked again to go back, it has no reset of its own (designer, 2026-11-08).
  await expect(design(page).locator(".tk-check", { hasText: "Visible" })).toHaveClass(/\bis-changed\b/);
  await expect(design(page).getByRole("button", { name: "Reset visible" })).toHaveCount(0);

  // Selected from the tree, it is still the phone view worked in: shown again there.
  await layers(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  await design(page).getByRole("checkbox", { name: "Visible" }).check();
  await expect.poll(() => shown(page, hero, "display")).toEqual(["flex", "flex", "flex"]);
});

test("changes to the structure made in the phone view change all three views at once", async ({ page }) => {
  await enterEditMode(page);
  const count = () => Promise.all(views(page).map((view) => view.contentFrame().locator("article:visible").count()));
  await expect.poll(() => count()).toEqual([4, 4, 4]);

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

  await page.locator("[data-tk-changes-opener]").click();
  const list = page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
  await expect(list.nth(0)).toContainText("below 768px");
  await expect(list.nth(1)).toContainText("768px to 1279px");
  await expect(list.nth(2)).not.toContainText("px to");
});

test("played, the window 700px wide shows the phone view's changes and 1100px wide the tablet view's: no width between the views gets the desktop view's alone", async ({ page }) => {
  await enterEditMode(page);
  await pick(page, phone(page), "article");
  await setField(page, "Fill color", "ff0000");
  await pick(page, tablet(page), "article");
  await setField(page, "Fill color", "2563eb");
  await expect.poll(() => shown(page, "article", "background-color")).toEqual([WHITE, BLUE, RED]);

  await page.getByRole("button", { name: "Full screen Desktop view", exact: true }).click();
  const card = desktop(page).contentFrame().locator("article").first();
  await page.setViewportSize({ width: 700, height: 720 });
  await expect(card).toHaveCSS("background-color", RED);
  await page.setViewportSize({ width: 1100, height: 720 });
  await expect(card).toHaveCSS("background-color", BLUE);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(card).toHaveCSS("background-color", WHITE);
});

/** Adds a view `width` px wide, and brings every view into sight. */
async function addView(page: Page, width: number) {
  await page.getByRole("button", { name: "Add view" }).click();
  await page.getByRole("spinbutton", { name: "New view width" }).fill(String(width));
  await page.getByRole("spinbutton", { name: "New view width" }).press("Enter");
  const view = page.locator(`iframe[title="Custom ${width}"]`);
  await expect(view.contentFrame().locator("h1")).toBeVisible();
  await page.keyboard.press("Shift+Digit1");
  return view;
}

/** Works in `view`, with the first card selected: picked there, at any zoom, then chosen in the layer tree. */
async function pickCard(page: Page, view: Locator) {
  await pick(page, view, "article");
  await layers(page).getByRole("treeitem", { name: "Card", exact: true }).first().click();
}

/** The computed fill of the first card in each of `views`. */
const fills = (...views: Locator[]) => Promise.all(views.map((view) => view.contentFrame().locator("article").first().evaluate((el) => getComputedStyle(el).backgroundColor)));

test("a view added at 1100px narrows the tablet's range; edited there, the tablet's change keeps its value in the tablet's range, and one undo puts it back whole", async ({ page }) => {
  await enterEditMode(page);
  await pick(page, tablet(page), "article");
  await setField(page, "Fill color", "ff0000");
  const custom = await addView(page, 1100);
  await expectRange(page, "Tablet", "768–1023", "md:max-lg:");
  await expectRange(page, "Custom", "1024–1279", "lg:max-xl:");
  await expect.poll(() => fills(tablet(page), custom)).toEqual([RED, RED]);

  await pickCard(page, custom);
  // The tablet's change holds here too: marked on its field.
  await expect(design(page).getByRole("button", { name: "Reset fill" })).toBeVisible();
  await setField(page, "Fill color", "2563eb");
  await expect.poll(() => fills(desktop(page), tablet(page), custom, phone(page))).toEqual([WHITE, RED, BLUE, WHITE]);

  await page.keyboard.press("Meta+z");
  await expect.poll(() => fills(desktop(page), tablet(page), custom, phone(page))).toEqual([WHITE, RED, RED, WHITE]);
});

test("reset in a view, a change reaching past the view's range inherits in that range only", async ({ page }) => {
  await enterEditMode(page);
  await pick(page, tablet(page), "article");
  await setField(page, "Fill color", "ff0000");
  const custom = await addView(page, 1100);

  await pickCard(page, custom);
  const reset = design(page).getByRole("button", { name: "Reset fill" });
  await reset.click();
  await expect.poll(() => fills(tablet(page), custom)).toEqual([RED, WHITE]);
  await expect(reset).toHaveCount(0);

  await page.keyboard.press("Meta+z");
  await expect.poll(() => fills(tablet(page), custom)).toEqual([RED, RED]);
});

test("a view wider than the desktop view's range stands for its own range, `2xl:` at 1920px: edited there, the desktop view keeps its value", async ({ page }) => {
  await enterEditMode(page);
  const wide = await addView(page, 1920);
  // The desktop view, 1280px wide, is in `xl`; 1920px is in `2xl`, the range above it, and the desktop view's label stops below it.
  await expectRange(page, "Custom", "≥ 1536", "2xl:");
  await expectRange(page, "Desktop", "1280–1535");

  await pickCard(page, wide);
  await expect(design(page).getByRole("region", { name: "Custom breakpoint" })).toContainText("1536px and wider");
  await setField(page, "Fill color", "ff0000");
  await expect.poll(() => fills(desktop(page), tablet(page), phone(page), wide)).toEqual([WHITE, WHITE, WHITE, RED]);
});
