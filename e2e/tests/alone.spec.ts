import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Page } from "./fixtures";

/**
 * Edit alone (ticket 114): one of the cards the features loop renders stops
 * following the others, from the selection toolbar; what is changed on it
 * from then on is changed on it alone, in every view, and what is changed on
 * the others still changes it, but where it has a value of its own.
 */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const row = (page: Page, nth: number) => layerTree(page).getByRole("treeitem", { name: "Card", exact: true }).nth(nth);
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selection" });
const alone = (page: Page) => toolbar(page).getByRole("button", { name: "Edit alone" });
const radius = (page: Page) => page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function setRadius(page: Page, value: string) {
  await radius(page).fill(value);
  await radius(page).press("Enter");
}

/** The corner radius of each Card, in each view: the desktop view first, then those beside it. */
async function cardRadii(page: Page): Promise<string[]> {
  const frames = [page.locator('iframe[title="Canvas"]'), ...(await page.locator("iframe.ht-canvas.is-beside").all())];
  const views = await Promise.all(frames.map((frame) => frame.contentFrame().locator("article").evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopLeftRadius))));
  return views.map((view) => view.join());
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a card of the loop edits alone from the selection toolbar: marked in the Layers and on the canvas, its corners its own, the others' corners still its own where it has none", async ({ page }) => {
  await enterEditMode(page);
  // Your turn, the Card used on its own, is in no loop.
  await row(page, 3).click();
  await expect(alone(page)).toHaveCount(0);

  await row(page, 1).click();
  await expect(alone(page)).toHaveAttribute("aria-pressed", "false");
  await alone(page).click();
  await expect(alone(page)).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, 1)).toHaveAttribute("aria-description", /· Edits alone$/);
  await expect(row(page, 0)).not.toHaveAttribute("aria-description", /Edits alone/);
  await expect(page.locator('.ht-selection[data-view="Desktop"]')).toHaveAttribute("data-alone", "true");

  await setRadius(page, "2");
  await expect.poll(() => cardRadii(page)).toEqual(Array(3).fill("12px,2px,12px,12px"));

  // A card that follows: the loop's cards change, the one alone keeps its own corners.
  await row(page, 0).click();
  await expect(alone(page)).toHaveAttribute("aria-pressed", "false");
  await setRadius(page, "6");
  await expect.poll(() => cardRadii(page)).toEqual(Array(3).fill("6px,2px,6px,12px"));

  await page.getByRole("button", { name: /not applied yet/ }).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toReadAs([/Corner radius · Card.* · 2nd alone/, /Corner radius · Card/]);
  await page.keyboard.press("Escape");

  // Following again, its corners go: it has the others' again. Undone, its own are back.
  await row(page, 1).click();
  await alone(page).click();
  await expect(alone(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => cardRadii(page)).toEqual(Array(3).fill("6px,6px,6px,12px"));
  await expect(row(page, 1)).not.toHaveAttribute("aria-description", /Edits alone/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => cardRadii(page)).toEqual(Array(3).fill("6px,2px,6px,12px"));
});
