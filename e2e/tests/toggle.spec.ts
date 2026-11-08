import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

test("the toggle appears on the page in development", async ({ page }) => {
  await page.goto(DEV_URL);

  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
});

const GAP = 16;
const SIZE = 40;

async function dragTo(page: Page, toggle: Locator, x: number, y: number) {
  const box = (await toggle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

async function expectAt(toggle: Locator, x: number, y: number) {
  await expect
    .poll(async () => {
      const box = (await toggle.boundingBox())!;
      return { x: Math.round(box.x), y: Math.round(box.y) };
    })
    .toEqual({ x, y });
}

test("the toggle can be dragged to any corner, and stays there after a reload", async ({ page }) => {
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  const { width, height } = page.viewportSize()!;
  const left = GAP;
  const right = width - GAP - SIZE;
  const top = GAP;
  const bottom = height - GAP - SIZE;

  await expectAt(toggle, right, bottom);

  await dragTo(page, toggle, 200, 150);
  await expectAt(toggle, left, top);

  await dragTo(page, toggle, width - 300, 100);
  await expectAt(toggle, right, top);

  await dragTo(page, toggle, 100, height - 120);
  await expectAt(toggle, left, bottom);

  await page.reload();
  await expectAt(toggle, left, bottom);

  // A drag is not a click: still in preview mode.
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
});

/**
 * Changes not yet applied are counted on a button of their own, beside the
 * toggle, the two as one: no longer a badge on the toggle's corner, too easily
 * pressed for it (designer, 2026-11-08).
 */
test("with changes, the toggle and the count are two buttons side by side, as one; without, the toggle alone", async ({ page }) => {
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  const count = page.getByRole("button", { name: /not applied yet/ });
  await expect(toggle).toBeVisible();
  await expect(count).toHaveCount(0);
  await expect(toggle).toHaveCSS("border-radius", "12px");

  await toggle.click();
  const canvas = page.locator('iframe[title="Canvas"]').contentFrame();
  await expect(canvas.locator("h1")).toBeVisible();
  await canvasInPlace(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).first().click();
  const fill = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await fill.fill("2563eb");
  await fill.press("Enter");
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await expect(count).toHaveText("1");
  const a = await steadyBox(toggle);
  const b = await steadyBox(count);
  // Side by side, the toggle first, apart by no more than a hairline.
  expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(0);
  expect(b.x - (a.x + a.width)).toBeLessThanOrEqual(2);
  expect(b.y).toBe(a.y);
  expect(b.height).toBe(a.height);
  expect(a.height).toBeGreaterThanOrEqual(40);
  expect(b.width).toBeGreaterThanOrEqual(40);
  // Rounded rectangles, their outer corners rounder than those where they join.
  await expect(toggle).toHaveCSS("border-radius", "12px 4px 4px 12px");
  await expect(count).toHaveCSS("border-radius", "4px 12px 12px 4px");

  const list = page.getByRole("dialog", { name: "Changes" });
  await count.click();
  await expect(list).toBeVisible();
  await expect(count).toHaveAttribute("aria-expanded", "true");
  await count.click();
  await expect(list).toHaveCount(0);

  await toggle.click();
  await expect(canvas.locator("h1")).toBeVisible();
});
