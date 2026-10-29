import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

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

/** The corner radius of each Card, in each view: the desktop view first, then those beside it. */
async function cardRadii(page: Page): Promise<string[][]> {
  const frames = [page.locator('iframe[title="Canvas"]'), ...(await page.locator("iframe.vk-canvas.is-beside").all())];
  return Promise.all(
    frames.map((frame) => frame.contentFrame().locator("article").evaluateAll((els) => els.map((el) => getComputedStyle(el).borderRadius))),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await enterEditMode(page);
});

test("a Card changed on one usage offers Promote on the top right of its selection; promoted, every usage of the Card changes in every view, and the change is to the Card itself", async ({ page }) => {
  await selectRow(page, "Card");
  await expect(promote(page)).toHaveCount(0);

  await radius(page).fill("2");
  await radius(page).press("Enter");
  await expect(promote(page)).toBeVisible();
  expect((await cardRadii(page)).map((view) => view.join())).toEqual(Array(3).fill("2px,2px,2px,12px"));

  // On the top right of the selection box, above it.
  const box = (await page.locator('.vk-selection[data-view="Desktop"]').boundingBox())!;
  const bar = (await toolbar(page).boundingBox())!;
  expect(Math.abs(bar.x + bar.width - (box.x + box.width))).toBeLessThan(1);
  expect(bar.y + bar.height).toBeLessThan(box.y);

  await promote(page).click();

  expect((await cardRadii(page)).map((view) => view.join())).toEqual(Array(3).fill("2px,2px,2px,2px"));
  // Nothing left to promote: the layer is still selected, with no Promote.
  await expect(promote(page)).toHaveCount(0);
  await expect(radius(page)).toHaveValue("2");
  await expect(badge(page)).toHaveText("1");
  await badge(page).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/Corner radius · Card.* · Card itself/]);
});

test("Promote goes as the layer is deselected and comes back as it is selected again; promoting is one step ⌘Z takes back", async ({ page }) => {
  await selectRow(page, "Card", 3);
  await radius(page).fill("2");
  await radius(page).press("Enter");
  await expect(promote(page)).toBeVisible();

  await selectRow(page, "Vernier Kit");
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
  await selectRow(page, "Card");
  await radius(page).fill("2");
  await radius(page).press("Enter");
  await selectRow(page, "Card", 3, ["Shift"]);
  await expect(promote(page)).toHaveCount(0);

  // The heading the App writes itself: it is changed where it is written.
  await selectRow(page, "Vernier Kit");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).fill("50");
  await design(page).getByRole("textbox", { name: "Opacity", exact: true }).press("Enter");
  await expect(badge(page)).toHaveText("2");
  await expect(promote(page)).toHaveCount(0);
});
