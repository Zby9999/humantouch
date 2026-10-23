import { expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

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
