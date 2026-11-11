import { canvasInPlace, expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

/*
 * Dark mode (designer, 2026-11-11): what is raised in the panels takes dark mode's raised grey and its light ink, not light mode's
 * white and dark grey. The open disclosures (the Layers' chevrons, an effect's fold) were white squares; the alignment's point
 * chosen kept its near-black on the dark grid.
 */
test.use({ colorScheme: "dark" });

const canvas = (page: Page) => page.locator('iframe[title="Canvas"]').contentFrame();
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const row = (page: Page, name: string) => page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).first();

/** Its color's lightness, 0 to 255, from a computed `rgb(…)`. */
function lightness(color: string) {
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return Math.round((Math.max(r, g, b) + Math.min(r, g, b)) / 2);
}

const look = (el: Locator, pseudo?: string) =>
  el.evaluate((node, pseudo) => {
    const style = getComputedStyle(node, pseudo);
    return { background: style.backgroundColor, color: style.color };
  }, pseudo);

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
});

test("dark: an open level's chevron and an effect's fold are raised in dark grey with a light chevron, not white", async ({ page }) => {
  await row(page, "Card").click();
  const chevron = page.locator('.ht-tree-chevron[data-open="true"]').first();
  const fold = design(page).getByRole("group", { name: "Effects" }).getByRole("button", { name: "Shadow 1 details" });
  for (const [name, el] of [["chevron", chevron], ["fold", fold]] as const) {
    const { background, color } = await look(el);
    // Dark mode's raised grey (#4a4a4a), as a segmented control's choice; its icon the light ink (#e6e6e6).
    expect(background, `${name}'s ground`).toBe("rgb(74, 74, 74)");
    expect(lightness(color), `${name}'s chevron light on it`).toBeGreaterThan(200);
  }
});

test("dark: a Layers row pointed at is darker than the row selected, not light grey", async ({ page }) => {
  await row(page, "Card").click();
  const pointed = row(page, "Header");
  await pointed.hover();
  // The selected row's dark ground (#383838) at 60%.
  await expect(pointed).toHaveCSS("background-color", /^(rgba\(56, 56, 56, 0\.6\)|color\(srgb 0\.219608 0\.219608 0\.219608 \/ 0\.6\))$/);
});

test("dark: an instance's name and icons read clearly on the dark panel", async ({ page }) => {
  await row(page, "Card").click();
  const name = design(page).locator(".ht-layer-name.is-instance");
  await expect(name).toBeVisible();
  // Purple 600's hue made lighter: purple 600 itself (#9a3cee) is 2.8:1 on the dark panel.
  expect(lightness((await look(name)).color)).toBeGreaterThan(170);
  const icon = page.locator(".ht-tree-row.is-instance .ht-icon:not(.ht-tree-chevron > .ht-icon)").first();
  expect(lightness((await look(icon)).color)).toBeGreaterThan(170);
});

test("dark: the alignment's point chosen is light on the dark grid", async ({ page }) => {
  await row(page, "Header").click();
  const grid = design(page).getByRole("radiogroup", { name: "Alignment" });
  const chosen = grid.locator('.ht-align-point[aria-checked="true"]');
  await expect(chosen).toHaveCount(1);
  const [point, ground] = await Promise.all([look(chosen, "::before"), look(grid)]);
  expect(lightness(point.background), "the point chosen, light").toBeGreaterThan(200);
  expect(lightness(ground.background), "on the dark grid").toBeLessThan(80);
});

test("dark: the Variables' names and counts are light on the panel, nothing in it white", async ({ page }) => {
  await expect(design(page).locator(".ht-panel-title")).toHaveText("Variables");
  const panel = design(page);
  const names = panel.locator(".ht-variants-ramp-name, .ht-variants-named-name");
  await expect(names.first()).toBeVisible();
  for (const color of await names.evaluateAll((els) => els.map((el) => getComputedStyle(el).color))) expect(lightness(color)).toBeGreaterThan(200);
  const count = panel.locator(".ht-variants-count").first();
  expect(lightness((await look(count)).color)).toBeGreaterThan(100);
  // An item in use, raised in dark grey, not white.
  const item = panel.locator(".ht-variants-row.is-button, .ht-variants-tile").first();
  await item.evaluate((el) => el.classList.add("is-in-use"));
  expect((await look(item)).background).toBe("rgb(74, 74, 74)");
});

test("dark: a shadow is drawn on a light chip, a spacing bar is blue 200's hue darkened, a radius tile's corner is lighter than its tile (planner, 2026-11-11)", async ({ page }) => {
  await expect(design(page).locator(".ht-panel-title")).toHaveText("Variables");
  const panel = design(page);
  // The shadow's chip light grey, not white, its tile dark round it.
  const chip = panel.locator(".ht-variants-shadow").first();
  expect((await look(chip)).background).toBe("rgb(242, 242, 242)");
  expect(lightness((await look(panel.locator(".ht-variants-tile:has(.ht-variants-shadow)").first())).background)).toBeLessThan(80);
  // A spacing bar: as far off the dark panel as light mode's bar is off its panel (1.30:1 and 1.29:1).
  expect((await look(panel.locator(".ht-variants-bar").first())).background).toBe("rgb(36, 64, 91)");
  // A radius tile's corner a step lighter than its tile, in use or not.
  const tile = panel.locator(".ht-variants-tile:has(.ht-variants-radius)").first();
  const block = tile.locator(".ht-variants-radius");
  for (const inUse of [false, true]) {
    if (inUse) await tile.evaluate((el) => el.classList.add("is-in-use"));
    expect(lightness((await look(block)).background), `in use: ${inUse}`).toBeGreaterThan(lightness((await look(tile)).background) + 10);
  }
});

test("dark: a shadow Variable's preview in the Add effect menu is drawn on a light chip", async ({ page }) => {
  await row(page, "Card").click();
  await design(page).getByRole("group", { name: "Effects" }).getByRole("button", { name: "Add effect" }).click();
  const preview = page.getByRole("dialog", { name: "Add effect" }).locator(".ht-variable-preview.is-shadow").first();
  await expect(preview).toBeVisible();
  expect((await look(preview)).background).toBe("rgb(242, 242, 242)");
});
