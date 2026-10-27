import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function backToPreviewMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

async function boxOf(locator: Locator) {
  return (await locator.boundingBox())!;
}

/** Drags `from` (selected first in the layer tree, by name) to the point `to` returns. */
async function drag(page: Page, name: string, from: Locator, to: () => Promise<{ x: number; y: number }>) {
  await layerTree(page).getByRole("treeitem", { name, exact: true }).first().click();
  const start = await boxOf(from);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const end = await to();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

/** The tags of an element's children on the live page, in the order they are drawn, top to bottom. */
function drawnOrder(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) =>
    [...el.children].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((child) => child.localName),
  );
}

/** The tags of an element's children on the live page, in its markup. */
function markupOrder(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => [...el.children].map((child) => child.localName));
}

const HERO = '[data-testid="hero"]';

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a reorder in a Stack shows on the live page, which keeps its own markup and goes on working as React renders it again", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterEditMode(page);
  const hero = canvas(page).locator(HERO);
  await drag(page, "Button", hero.locator("> button"), async () => {
    const p = await boxOf(hero.locator("> p"));
    return { x: p.x + p.width / 2, y: p.y + 2 };
  });
  const onCanvas = await hero.locator("> button").evaluate((el) => el.getBoundingClientRect().top - el.parentElement!.getBoundingClientRect().top);
  await backToPreviewMode(page);

  expect(await drawnOrder(page, HERO)).toEqual(["header", "button", "p"]);
  expect(await markupOrder(page, HERO)).toEqual(["header", "p", "button"]);
  const live = await page.locator(`${HERO} > button`).evaluate((el) => el.getBoundingClientRect().top - el.parentElement!.getBoundingClientRect().top);
  expect(Math.abs(live - onCanvas)).toBeLessThanOrEqual(1);
  await expect(page.getByText(/shows? once applied/)).toHaveCount(0);

  // The button opens a dialog: App renders again.
  await page.locator(`${HERO} > button`).click();
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  expect(await drawnOrder(page, HERO)).toEqual(["header", "button", "p"]);
  expect(errors).toEqual([]);

  await page.getByRole("radio", { name: "Now" }).click();
  expect(await drawnOrder(page, HERO)).toEqual(["header", "p", "button"]);
});

test("a reorder in a plain flow shows in every instance of its usage", async ({ page }) => {
  await enterEditMode(page);
  const card = canvas(page).locator("article").first();
  await drag(page, "Freeze", card.locator("h3"), async () => {
    const body = await boxOf(card.locator("p"));
    return { x: body.x + body.width / 2, y: body.y + body.height - 2 };
  });
  await backToPreviewMode(page);

  const cards = page.locator("article");
  for (const n of [0, 1, 2]) expect(await drawnOrder(page, `article >> nth=${n}`)).toEqual(["p", "h3"]);
  expect(await drawnOrder(page, "article >> nth=3")).toEqual(["h3", "p"]);
  await expect(cards).toHaveCount(4);
});

test("a deleted layer is gone from the live page; a move into another container shows once applied", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "A Framer-style editor layer for any page.", exact: true }).click();
  await page.keyboard.press("Delete");
  const hero = canvas(page).locator(HERO);
  await drag(page, "Button", hero.locator("> button"), async () => {
    const badge = await boxOf(canvas(page).getByTestId("acme-badge"));
    return { x: badge.x + badge.width / 2 + 1, y: badge.y + badge.height / 2 };
  });
  await backToPreviewMode(page);

  await expect(page.locator(`${HERO} > p`)).toBeHidden();
  await expect(page.locator(`${HERO} > p`)).toHaveCount(1);
  await expect(page.getByText("1 change shows once applied")).toBeVisible();
  expect(await markupOrder(page, HERO)).toEqual(["header", "p", "button"]);
});
