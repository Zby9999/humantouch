import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

const RED = "rgb(255, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function backToPreviewMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of every card on the live page, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius" = "backgroundColor") {
  return page.locator("article").evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

/** Fills the three cards of the loop red and rounds their corners to 2px, then goes back to preview mode. */
async function changeTheCards(page: Page) {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await backToPreviewMode(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("back in preview mode, the live page shows the changes on the instances of their usage only", async ({ page }) => {
  await changeTheCards(page);

  // Three cards come from one usage in a loop; "Your turn" is another usage of Card.
  expect(await cardStyles(page)).toEqual([RED, RED, RED, WHITE]);
  expect(await cardStyles(page, "borderRadius")).toEqual(["2px", "2px", "2px", "12px"]);
});

test("elements React renders later show the changes from their first frame, and the page works as usual", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  await selectRow(page, "Dialog");
  await setField(page, "Fill color", "ff0000");
  await backToPreviewMode(page);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The backdrop as the browser is about to paint it for the first time.
  const firstFrame = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        [...document.querySelectorAll("button")].find((button) => button.textContent!.includes("Get started"))!.click();
        requestAnimationFrame(() => resolve(getComputedStyle(document.querySelector('[role="dialog"]')!.parentElement!).backgroundColor));
      }),
  );

  expect(firstFrame).toBe("rgba(255, 0, 0, 0.4)");
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toBeVisible();
});

test("the Changed / Now switch compares the page with the site as it is, and stays as set after a reload", async ({ page }) => {
  await changeTheCards(page);
  const preview = page.getByRole("radiogroup", { name: "Change Preview" });
  await expect(preview.getByRole("radio", { name: "Changed" })).toBeChecked();

  await preview.getByRole("radio", { name: "Now" }).click();
  expect(await cardStyles(page)).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await preview.getByRole("radio", { name: "Changed" }).click();
  expect(await cardStyles(page)).toEqual([RED, RED, RED, WHITE]);

  // The round is saved half a second after the last edit; the preview comes back with it.
  await page.waitForTimeout(700);
  await page.reload();
  await expect.poll(() => cardStyles(page)).toEqual([RED, RED, RED, WHITE]);
  await preview.getByRole("radio", { name: "Now" }).click();
  await page.reload();
  await expect(preview.getByRole("radio", { name: "Now" })).toBeChecked();
  expect(await cardStyles(page)).toEqual([WHITE, WHITE, WHITE, WHITE]);
});

test("with no changes, there is nothing to switch", async ({ page }) => {
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Change Preview" })).toHaveCount(0);
});

test("changes the live page cannot find, with no source marker, are counted as showing once applied", async ({ page }) => {
  await changeTheCards(page);
  await expect(page.getByText(/once applied/)).toHaveCount(0);

  // React's root element comes from index.html, which carries no source markers.
  await enterEditMode(page);
  const root = page.getByRole("tree", { name: "Layers" }).getByRole("treeitem").first();
  await root.click();
  await expect(design(page).getByText("Not located")).toBeVisible();
  await design(page).getByRole("button", { name: "Add fill" }).click();
  await backToPreviewMode(page);

  await expect(page.getByText("1 change shows once applied")).toBeVisible();
  await page.getByRole("radio", { name: "Now" }).click();
  await expect(page.getByText(/once applied/)).toHaveCount(0);
});
