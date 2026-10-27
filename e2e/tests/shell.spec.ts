import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

// What the designer sees the first time: no Layers panel yet.
test.use({ showLayers: false });

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
}

/** Left and right edges of an element, in the window. */
async function edges(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = (await locator.boundingBox())!;
  return { left: box.x, right: box.x + box.width };
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
});

test("the Layers panel starts hidden; a button shows it, another hides it, and it stays as set after a reload", async ({ page }) => {
  await enterEditMode(page);
  await expect(layers(page)).toHaveCount(0);
  await expect(design(page)).toBeVisible();

  await page.getByRole("button", { name: "Show layers" }).click();
  await expect(layers(page).getByRole("tree", { name: "Layers" })).toBeVisible();
  // Focus moves to the button that hides it again.
  await expect(page.getByRole("button", { name: "Hide layers" })).toBeFocused();

  await page.reload();
  await enterEditMode(page);
  await expect(layers(page)).toBeVisible();
  await page.getByRole("button", { name: "Hide layers" }).click();
  await expect(layers(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show layers" })).toBeFocused();
});

test("the panels float over the canvas, which is fitted into the room they leave", async ({ page }) => {
  await enterEditMode(page);
  const canvas = page.locator('iframe[title="Canvas"]');
  const viewport = page.getByRole("region", { name: "Canvas viewport" });
  const width = page.viewportSize()!.width;

  // The canvas fills the window behind the panels; the Design panel stands off the window's edge.
  expect(await edges(page, viewport)).toEqual({ left: 0, right: width });
  const panel = await edges(page, design(page));
  expect(panel.right).toBe(width - 8);
  expect((await edges(page, canvas)).right).toBeLessThan(panel.left);

  await page.getByRole("button", { name: "Show layers" }).click();
  await page.keyboard.press("Shift+Digit1");
  const left = await edges(page, layers(page));
  expect(left.left).toBe(8);
  const fitted = await edges(page, canvas);
  expect(fitted.left).toBeGreaterThan(left.right);
  expect(fitted.right).toBeLessThan(panel.left);
});
