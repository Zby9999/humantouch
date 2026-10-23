import { readdirSync, readFileSync, rmSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
test.afterAll(() => rmSync(VERNIER, { recursive: true, force: true }));

const LOCKED_LABEL = /^Vernier Kit: applying design changes/;

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** Fills the three cards of the loop red and rounds their corners to 2px: two changes, saved. */
async function changeTheCards(page: Page) {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);
}

const progress = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });
const badge = (page: Page) => page.getByRole("status", { name: /not applied yet/ });

/** How each archived round ended. */
function results() {
  const history = `${VERNIER}history/`;
  return readdirSync(history)
    .sort()
    .map((round) => JSON.parse(readFileSync(`${history}${round}/result.json`, "utf8")));
}

test("claim folds the editor into a locked toggle; each done fills the ring and counts the badge down; finish unlocks it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);

  await vernierkit("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  await expect(badge(page)).toHaveText("2");
  await toggle.click({ force: true });
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await vernierkit("done", "1");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(badge(page)).toHaveText("1");

  await vernierkit("done", "2");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "2");
  await expect(badge(page)).toHaveCount(0);

  await vernierkit("finish");
  await expect(progress(page)).toHaveCount(0);
  // A new round: edit mode freezes the page afresh.
  await enterEditMode(page);
  await expect(canvas(page).locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(results()).toMatchObject([{ ended: "finished", done: [1, 2] }]);
});

test("a page loaded while the round is being applied shows it locked", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "2");

  await page.reload();

  await expect(page.getByRole("button", { name: LOCKED_LABEL })).toHaveAttribute("aria-disabled", "true");
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");
});

test("pressing and holding the locked toggle unlocks it: done changes are archived, the others recorded, the canvas dropped", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "1");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "1");

  await toggle.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();

  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  await expect(progress(page)).toHaveCount(0);
  // Letting go was not a click on the toggle.
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  expect(results()).toMatchObject([{ ended: "unlocked", done: [1] }]);
  expect(readVernier("changeset.json")).toBeNull();
  expect(readdirSync(VERNIER)).toEqual(["history"]);
  expect(await vernierkit("last")).toContain("- **Status:** Not applied\n");
});

test("a short press on the locked toggle does nothing", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  const toggle = page.getByRole("button", { name: LOCKED_LABEL });

  await toggle.click({ force: true });

  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(readVernier("state.json")).toEqual({ status: "claimed", done: [] });
});
