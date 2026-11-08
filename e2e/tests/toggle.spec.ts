import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

test("the toggle appears on the page in development", async ({ page }) => {
  await page.goto(DEV_URL);

  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
});

/** From the window's edge to the toggle: the dock 16px in, the toggle 4px in from its edge (designer, 2026-11-09). */
const GAP = 20;
const SIZE = 28;

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
 * Changes not yet applied are counted on a button of their own, after the
 * toggle: no longer a badge on the toggle's corner, too easily pressed for it
 * (designer, 2026-11-08). The two in a column as the canvas's tools, the toggle
 * nearest its corner (designer, 2026-11-09).
 */
test("with changes, the toggle and the count are two buttons in a column, the toggle nearest its corner; without, the toggle alone", async ({ page }) => {
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  const count = page.getByRole("button", { name: /not applied yet/ });
  await expect(toggle).toBeVisible();
  await expect(count).toHaveCount(0);
  await expect(toggle).toHaveCSS("border-radius", "6px");

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
  // In the bottom right corner, the count above the toggle, 3px apart, both 28px across.
  expect(a.y - (b.y + b.height)).toBe(3);
  expect(b.x).toBe(a.x);
  expect(b.height).toBe(a.height);
  expect(a.height).toBe(28);
  expect(b.width).toBe(28);
  await expect(toggle).toHaveCSS("border-radius", "6px");
  await expect(count).toHaveCSS("border-radius", "6px");

  const list = page.getByRole("dialog", { name: "Changes" });
  await count.click();
  await expect(list).toBeVisible();
  await expect(count).toHaveAttribute("aria-expanded", "true");
  await count.click();
  await expect(list).toHaveCount(0);

  await toggle.click();
  await expect(canvas.locator("h1")).toBeVisible();
});

/** Too many for its height, the rows scroll between the title and Discard all, an edge with rows past it fading (designer, 2026-11-09). */
test("the change list too long for the window: its title and Discard all stay, the rows scroll between them, an edge with rows past it fading", async ({ page }) => {
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
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

  // So short a window that the one row does not fit.
  await page.setViewportSize({ width: 800, height: 200 });
  await page.getByRole("button", { name: /not applied yet/ }).click();
  const dialog = page.getByRole("dialog", { name: "Changes" });
  const rows = dialog.locator(".tk-changes-list");
  await expect(dialog.getByRole("heading")).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Discard all" })).toBeInViewport();
  const [box, title, discard] = [await steadyBox(dialog), await steadyBox(dialog.getByRole("heading")), await steadyBox(dialog.getByRole("button", { name: "Discard all" }))];
  expect(title.y).toBeGreaterThanOrEqual(box.y);
  expect(discard.y + discard.height).toBeLessThanOrEqual(box.y + box.height);
  expect(await rows.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(rows).toHaveClass(/is-below/);
  await expect(rows).not.toHaveClass(/is-above/);

  await rows.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(rows).toHaveClass(/is-above/);
  await expect(rows).not.toHaveClass(/is-below/);
  await expect(rows).toHaveCSS("mask-image", /linear-gradient/);
});
