import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";

/** The desktop view: the canvas. */
function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function selectRow(page: Page, name: string, nth = 0, modifiers?: "Shift"[]) {
  await layerTree(page).getByRole("treeitem", { name, exact: true }).nth(nth).click({ modifiers });
}

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selection" });
const promote = (page: Page) => toolbar(page).getByRole("button", { name: "Promote" });
const radius = (page: Page) => design(page).getByRole("textbox", { name: "Corner radius" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const toast = (page: Page) => page.getByRole("status").locator(".tk-toast");
const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');

/**
 * Each Card's title inline in its flow, so the Card is a Frame rather than a
 * plain top-to-bottom flow shown as a Stack: a title nudged in a narrower view
 * is placed freely there, the Card its positioning reference at that breakpoint.
 */
async function inlineTitles(page: Page) {
  await page.evaluate(() => document.querySelectorAll("article h3").forEach((el) => ((el as HTMLElement).style.display = "inline-block")));
}

/** Selects, in a view, the deepest layer under the middle of the first `selector` there: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up("ControlOrMeta");
}

/** The corner radius of each Card, in each view: the desktop view first, then those beside it. */
async function cardRadii(page: Page): Promise<string[][]> {
  const frames = [page.locator('iframe[title="Canvas"]'), ...(await page.locator("iframe.tk-canvas.is-beside").all())];
  return Promise.all(
    frames.map((frame) => frame.contentFrame().locator("article").evaluateAll((els) => els.map((el) => getComputedStyle(el).borderRadius))),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a Card changed on one usage offers Promote on the top right of its selection; promoted, every usage of the Card changes in every view, and the change is to the Card itself", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await expect(promote(page)).toHaveCount(0);

  await radius(page).fill("2");
  await radius(page).press("Enter");
  await expect(promote(page)).toBeVisible();
  // The views beside show a value typed in once the next frame is drawn (ADR 0011).
  await expect.poll(async () => (await cardRadii(page)).map((view) => view.join())).toEqual(Array(3).fill("2px,2px,2px,12px"));

  // On the top right of the selection box, above it.
  const box = (await page.locator('.tk-selection[data-view="Desktop"]').boundingBox())!;
  const bar = (await toolbar(page).boundingBox())!;
  expect(Math.abs(bar.x + bar.width - (box.x + box.width))).toBeLessThan(1);
  expect(bar.y + bar.height).toBeLessThan(box.y);

  await promote(page).click();

  expect((await cardRadii(page)).map((view) => view.join())).toEqual(Array(3).fill("2px,2px,2px,2px"));
  // Nothing left to promote: the layer is still selected, with no Promote.
  await expect(promote(page)).toHaveCount(0);
  await expect(radius(page)).toHaveValue("2");
  await expect(badge(page)).toHaveText("1");
  // All of its changes went to the Card, which the badge shows the edit of: nothing stays to tell of.
  await expect(toast(page)).toHaveCount(0);
  await badge(page).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/Corner radius · Card.* · Card itself/]);
});

test("Promote goes as the layer is deselected and comes back as it is selected again; promoting is one step ⌘Z takes back", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card", 3);
  await radius(page).fill("2");
  await radius(page).press("Enter");
  await expect(promote(page)).toBeVisible();

  await selectRow(page, "Third Kind");
  await expect(promote(page)).toHaveCount(0);
  await selectRow(page, "Card", 3);
  await expect(promote(page)).toBeVisible();

  await promote(page).click();
  expect((await cardRadii(page))[0]).toEqual(Array(4).fill("2px"));
  await page.keyboard.press("ControlOrMeta+z");
  expect((await cardRadii(page))[0]).toEqual(["12px", "12px", "12px", "2px"]);
  await expect(promote(page)).toBeVisible();
});

test("no Promote with more than one layer selected, nor on a layer with no component to promote to", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await radius(page).fill("2");
  await radius(page).press("Enter");
  await selectRow(page, "Card", 3, ["Shift"]);
  await expect(promote(page)).toHaveCount(0);

  // The heading the App writes itself: it is changed where it is written.
  await selectRow(page, "Third Kind");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).fill("50");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).press("Enter");
  await expect(badge(page)).toHaveText("2");
  await expect(promote(page)).toHaveCount(0);
});

test("promoted, a layer's changes that stay with its usage are told in a toast: free placement at a breakpoint depends on this usage's container", async ({ page }) => {
  await inlineTitles(page);
  await enterEditMode(page);
  await expect(tablet(page).contentFrame().locator("article h3").first()).toBeVisible();

  await pick(page, desktop(page), "article h3");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).fill("50");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).press("Enter");
  await pick(page, tablet(page), "article h3");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => tablet(page).contentFrame().locator("article h3").first().evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
  await expect(badge(page)).toHaveText("2");

  await promote(page).click();

  await expect(toast(page)).toHaveText("Promoted 1 change to Card. 1 stays with this usage: free placement at Tablet depends on this usage's container.");
  // The placement is still this usage's, in the change notes too.
  await expect(promote(page)).toHaveCount(0);
  await badge(page).click();
  const items = page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: "Opacity" })).toHaveText(/· Card itself/);
  await expect(items.filter({ hasText: "Absolute" })).not.toHaveText(/Card itself/);
});

test("no Promote on a layer whose only change is free placement at a breakpoint, which stays with its usage", async ({ page }) => {
  await inlineTitles(page);
  await enterEditMode(page);
  await expect(tablet(page).contentFrame().locator("article h3").first()).toBeVisible();

  await pick(page, tablet(page), "article h3");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => tablet(page).contentFrame().locator("article h3").first().evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
  await expect(badge(page)).toHaveText("1");
  await expect(toolbar(page)).toHaveCount(0);
});
