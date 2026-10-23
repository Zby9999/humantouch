import { expect, test, type CDPSession, type Page } from "./fixtures";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

test.use({ reducedMotion: "no-preference" });

const canvasIframe = (page: Page) => page.locator('iframe[title="Canvas"]');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });

/** Plays the page's animations at `rate` times their speed, so a test can look at them midway. */
async function playbackRate(cdp: CDPSession, rate: number) {
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
}

async function box(page: Page) {
  return (await canvasIframe(page).boundingBox())!;
}

/** The canvas sits inside the middle column, scaled down. */
async function expectSettled(page: Page) {
  const area = (await viewportArea(page).boundingBox())!;
  await expect
    .poll(async () => {
      const b = await box(page);
      return b.x > area.x && b.x + b.width < area.x + area.width;
    })
    .toBe(true);
}

let cdp: CDPSession;

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
});

test("entering edit mode shrinks the page from where it was in the window into the canvas", async ({ page }) => {
  await page.evaluate(() => scrollTo(0, 120));
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await playbackRate(cdp, 0.02);

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();

  // Starts out covering the window exactly as the page did, scrolled the same.
  const start = await box(page);
  expect(start.x).toBeCloseTo(0, -1);
  expect(start.y).toBeCloseTo(-120, -1);
  expect(start.width).toBeCloseTo(pageWidth, -1);

  await playbackRate(cdp, 1);
  await expectSettled(page);
});

test("going back to preview grows the canvas back over the page before the editor goes away", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  const settled = await box(page);
  await playbackRate(cdp, 0.02);

  await page.getByRole("button", { name: EXIT_LABEL }).click();

  // Still there, on its way back to full size.
  await expect.poll(async () => (await box(page)).width).toBeGreaterThan(settled.width);
  await playbackRate(cdp, 1);
  await expect(canvasIframe(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("with changes not yet applied, the canvas fades into the page once it has grown back over it", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const hex = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("ff0000");
  await hex.press("Enter");
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await playbackRate(cdp, 0.1);

  await page.getByRole("button", { name: EXIT_LABEL }).click();

  // The page has none of the changes yet: rather than cut to it, the editor dissolves into it, the canvas at full size.
  const shell = page.locator(".vk-shell");
  await expect.poll(() => shell.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.9);
  const grown = await box(page);
  expect(grown.x).toBeCloseTo(0, 0);
  expect(grown.width).toBeCloseTo(pageWidth, 0);
  await playbackRate(cdp, 1);
  await expect(canvasIframe(page)).toHaveCount(0);
});

test("a click while going back to preview turns around to the same canvas", async ({ page }) => {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expectSettled(page);
  const canvasMark = await canvasIframe(page).evaluate((frame: HTMLIFrameElement) => (frame.dataset.test = "same"));
  await playbackRate(cdp, 0.02);
  await page.getByRole("button", { name: EXIT_LABEL }).click();

  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await playbackRate(cdp, 1);

  await expectSettled(page);
  await expect(canvasIframe(page)).toHaveAttribute("data-test", canvasMark);
  await expect(page.getByRole("button", { name: EXIT_LABEL })).toBeVisible();
});

test("switching modes from the keyboard is instant", async ({ page }) => {
  await playbackRate(cdp, 0.02);
  await page.getByRole("button", { name: TOGGLE_LABEL }).focus();

  await page.keyboard.press("Enter");

  await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
  const area = (await viewportArea(page).boundingBox())!;
  expect((await box(page)).width).toBeLessThan(area.width);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the canvas does not travel; the editor only fades", async ({ page }) => {
    await playbackRate(cdp, 0.02);

    await page.getByRole("button", { name: TOGGLE_LABEL }).click();

    await expect(canvasIframe(page).contentFrame().locator("h1")).toBeVisible();
    const area = (await viewportArea(page).boundingBox())!;
    expect((await box(page)).width).toBeLessThan(area.width);
  });
});
