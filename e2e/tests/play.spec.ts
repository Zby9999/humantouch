import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Page } from "./fixtures";

const RED = "rgb(255, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
/** A view's full screen button, at the right end of its label (designer, 2026-11-08). */
const fullScreen = (page: Page, view = "Desktop") => page.getByRole("button", { name: `Full screen ${view} view`, exact: true });
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop playing" });

/** Where the canvas is in the window, and at what scale. */
function canvasBox(page: Page) {
  return page.locator('iframe[title="Canvas"]').evaluate((iframe) => {
    const r = iframe.getBoundingClientRect();
    return { x: r.x, y: r.y, scale: Math.round((r.width / (iframe as HTMLIFrameElement).offsetWidth) * 1000) / 1000 };
  });
}

/** Fills the cards of the loop red, the first card selected. */
async function fillTheCards(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const field = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await field.fill("ff0000");
  await field.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("full screen plays a view at its own width: the desktop view's as wide as the window, a change made in the phone view showing once the window is as narrow; the phone view's 390px wide in the middle, with that change", async ({ page }) => {
  const frozenAt = page.viewportSize()!.width;
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  const phone = page.locator('iframe[title="Phone 390"]');
  await expect(phone.contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
  const box = (await phone.contentFrame().locator("article").first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).fill("ff0000");
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).press("Enter");
  const card = canvas(page).locator("article").first();
  await expect(card).toHaveCSS("background-color", WHITE);

  await fullScreen(page, "Desktop").click();
  const width = () => page.locator('iframe[title="Canvas"]').evaluate((iframe) => (iframe as HTMLIFrameElement).offsetWidth);
  await expect.poll(() => width()).toBe(page.viewportSize()!.width);
  await expect(card).toHaveCSS("background-color", WHITE);
  // Below the example's `md`, 768px, where the tablet view's range starts: the phone's breakpoint.
  await page.setViewportSize({ width: 500, height: 720 });
  await expect(card).toHaveCSS("background-color", RED);
  await expect.poll(width).toBe(500);
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(card).toHaveCSS("background-color", WHITE);

  // Back to editing, the desktop view is as wide as the page was frozen at again.
  await page.setViewportSize({ width: frozenAt, height: 720 });
  await page.keyboard.press("Escape");
  await expect(design(page)).toBeVisible();
  await expect(card).toHaveCSS("background-color", WHITE);
  await expect.poll(() => width()).toBe(frozenAt);

  // The phone view's: 390px wide whatever the window's width, in the middle of it, with the phone's change.
  await fullScreen(page, "Phone").click();
  await expect(design(page)).toBeHidden();
  await expect.poll(width).toBe(390);
  await expect(card).toHaveCSS("background-color", RED);
  const area = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  const played = await steadyBox(page.locator('iframe[title="Canvas"]'));
  expect(played.width).toBe(390);
  expect(Math.abs(played.x + played.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(width).toBe(390);
  await expect(card).toHaveCSS("background-color", RED);

  // Esc: back to editing, focus on the button that started it.
  await page.setViewportSize({ width: frozenAt, height: 720 });
  await page.keyboard.press("Escape");
  await expect(design(page)).toBeVisible();
  await expect.poll(() => width()).toBe(frozenAt);
  await expect(card).toHaveCSS("background-color", WHITE);
  await expect(fullScreen(page, "Phone")).toBeFocused();
});

test("full screen shows the canvas alone, at full size, with its changes; Esc goes back to editing as it was; the Design panel has no Play button", async ({ page }) => {
  await fillTheCards(page);
  const before = await canvasBox(page);
  await expect(design(page).getByRole("button", { name: "Play", exact: true })).toHaveCount(0);

  await fullScreen(page).click();
  await expect(layers(page)).toBeHidden();
  await expect(design(page)).toBeHidden();
  await expect(page.locator(".tk-selection")).toHaveCount(0);
  await expect.poll(async () => (await canvasBox(page)).scale).toBe(1);
  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", RED);

  // It scrolls like a page.
  const top = (await canvasBox(page)).y;
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await canvasBox(page)).y).toBeLessThan(top);

  await page.keyboard.press("Escape");
  await expect(design(page)).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FF0000");
  await expect.poll(() => canvasBox(page)).toEqual(before);
  await expect(fullScreen(page)).toBeFocused();
});

test("while playing, nothing is selected or edited: clicks and keys leave the canvas as it is", async ({ page }) => {
  await fillTheCards(page);
  await fullScreen(page).click();
  await expect(stopButton(page)).toBeVisible();

  await canvas(page).locator("h1").click({ force: true });
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("t");

  await stopButton(page).click();
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FF0000");
  await expect(canvas(page).locator("h1")).toBeVisible();
  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", RED);
  await expect(page.getByRole("region", { name: "Canvas viewport" })).not.toHaveClass(/is-drawing/);
});

test("back in preview mode, the page is as the code has it: the changes are on the canvas only", async ({ page }) => {
  await fillTheCards(page);
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await expect(page.locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
});
