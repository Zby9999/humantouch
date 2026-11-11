import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Page } from "./fixtures";

// What the designer sees the first time: no Layers panel yet.
test.use({ showLayers: false });

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** Left and right edges of an element, in the window. */
async function edges(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = (await locator.boundingBox())!;
  return { left: box.x, right: box.x + box.width };
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
});

test("the Layers panel starts hidden; a button shows it, another hides it", async ({ page }) => {
  await enterEditMode(page);
  await expect(layers(page)).toHaveCount(0);
  await expect(design(page)).toBeVisible();

  await page.getByRole("button", { name: "Show layers" }).click();
  await expect(layers(page).getByRole("tree", { name: "Layers" })).toBeVisible();
  // Focus moves to the button that hides it again.
  await expect(page.getByRole("button", { name: "Hide layers" })).toBeFocused();

  await page.getByRole("button", { name: "Hide layers" }).click();
  await expect(layers(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show layers" })).toBeFocused();
});

test("the Layers panel is hidden on every entry, shown or hidden the last time; shown, it stays so while editing (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("button", { name: "Show layers" }).click();
  await expect(layers(page).getByRole("tree", { name: "Layers" })).toBeVisible();
  // Shown, it stays so as the designer works: a layer selected, the panel still there.
  await layers(page).getByRole("treeitem").first().click();
  await expect(layers(page)).toBeVisible();

  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(design(page)).toHaveCount(0);
  await enterEditMode(page);
  await expect(layers(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show layers" })).toBeVisible();

  // Nor does a reload bring it back.
  await page.getByRole("button", { name: "Show layers" }).click();
  await expect(layers(page)).toBeVisible();
  await page.reload();
  await enterEditMode(page);
  await expect(layers(page)).toHaveCount(0);
});

test("with the Layers panel hidden, the canvas takes its room; shown, the panel takes it back", async ({ page }) => {
  await enterEditMode(page);
  const viewport = page.getByRole("region", { name: "Canvas viewport" });
  const panel = await edges(page, design(page));

  await expect.poll(() => edges(page, viewport)).toEqual({ left: 0, right: panel.left });

  const canvas = page.locator('iframe[title="Canvas"]');
  const before = await edges(page, canvas);

  await page.getByRole("button", { name: "Show layers" }).click();
  const left = await edges(page, layers(page));
  expect(left.left).toBe(0);
  await expect.poll(() => edges(page, viewport)).toEqual({ left: left.right, right: panel.left });
  // The canvas stays where it was on screen as the panel opens beside it.
  await expect.poll(() => edges(page, canvas)).toEqual(before);
});

/*
 * A swipe over a part of the editor where nothing scrolls went on to the page under it: the page scrolled behind the
 * editor, and on a Mac its rubber band took the whole editor along, the page's own background in a strip at the
 * window's edge (designer, 2026-11-11). Headless Chromium has no rubber band, so the page's own scrolling stands in
 * for it, sideways too on a page wider than the window.
 */
test("a wheel over the Show layers button or the tools does not reach the page under the editor, down or sideways (designer, 2026-11-11)", async ({ page }) => {
  // A page wider than the window, as well as taller: it could scroll sideways, as a rubber band takes it.
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.cssText = "width: 3000px; height: 1px";
    document.body.append(wide);
  });
  await enterEditMode(page);
  const scrolled = () => page.evaluate(() => ({ x: scrollX, y: scrollY }));
  expect(await scrolled()).toEqual({ x: 0, y: 0 });

  for (const part of [page.getByRole("button", { name: "Show layers" }), page.getByRole("toolbar", { name: "Tools" })]) {
    const box = (await part.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await page.mouse.wheel(300, 0);
    // A wheel scrolls in a frame or two: given the time, the page would have moved.
    await page.waitForTimeout(200);
    expect(await scrolled()).toEqual({ x: 0, y: 0 });
  }
  // The shell a scroller only to end the wheel: nothing past its edges, so it never scrolls itself.
  const shell = await page.locator(".ht-shell").evaluate((el) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight, left: el.scrollLeft, top: el.scrollTop }));
  expect(shell).toEqual({ x: 0, y: 0, left: 0, top: 0 });
});
