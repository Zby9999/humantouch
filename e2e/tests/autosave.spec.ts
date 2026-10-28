import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { clearVernier } from "./project-files";

/** These tests save into the example project's `.vernier/` for real, so they go one at a time. */
test.use({ keepRoundInMemory: false });
test.describe.configure({ mode: "serial" });

const VERNIER = fileURLToPath(new URL("../../examples/vite-react19-tw4/.vernier/", import.meta.url));
const CHANGESET = `${VERNIER}changeset.json`;
const CANVAS = `${VERNIER}canvas.html`;

test.beforeEach(() => clearVernier(VERNIER));
test.afterAll(() => clearVernier(VERNIER));

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

/** Gives the first card a red fill from the Design panel. */
async function fillFirstCardRed(page: Page) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const hex = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("ff0000");
  await hex.press("Enter");
}

function savedChanges() {
  return existsSync(CHANGESET) ? JSON.parse(readFileSync(CHANGESET, "utf8")).changes : null;
}

/** Where the editor layer reaches the local service, as the dev server hands it to the page. */
function service(page: Page): Promise<{ url: string; token: string }> {
  return page.evaluate(() => (window as unknown as { __VERNIERKIT__: { url: string; token: string } }).__VERNIERKIT__);
}

test("the local service listens on 127.0.0.1 only, and turns away requests without its token", async ({ page, request }) => {
  await page.goto(DEV_URL);
  const { url, token } = await service(page);
  const round = `${url}/round`;

  expect(new URL(url).hostname).toBe("127.0.0.1");
  expect((await request.get(round)).status()).toBe(401);
  expect((await request.get(round, { headers: { "X-Vernier-Token": "not-the-token" } })).status()).toBe(401);
  expect((await request.put(round, { data: { canvas: "<html></html>", changeSet: { lastId: 0, changes: [] } } })).status()).toBe(401);
  expect((await request.delete(round)).status()).toBe(401);
  expect((await request.get(round, { headers: { "X-Vernier-Token": token } })).ok()).toBe(true);
  // Not on any other address of this machine.
  await expect(request.get(`http://[::1]:${new URL(url).port}/round`, { headers: { "X-Vernier-Token": token } })).rejects.toThrow();
});

test("edits are saved into the project about half a second after the designer stops, with no save action", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);

  await fillFirstCardRed(page);
  const edited = Date.now();
  expect(savedChanges()).toBeNull();

  await expect.poll(savedChanges, { intervals: [50] }).toMatchObject([
    { property: "fill", before: { color: "#FFFFFF" }, after: { color: "#FF0000" }, target: { component: "Card", instances: 3 } },
  ]);
  const waited = Date.now() - edited;
  expect(waited).toBeGreaterThanOrEqual(400);
  expect(waited).toBeLessThan(1500);
  // The saved canvas, edits included: the frozen page with red cards.
  const saved = readFileSync(CANVAS, "utf8");
  expect(saved).toContain("Vernier Kit</h1>");
  expect(saved).toMatch(/background-color: rgb\(255, 0, 0\) !important/);
});

/** Background of every card on the canvas, in page order. */
function cardFills(page: Page) {
  return canvas(page)
    .locator("article")
    .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backgroundColor));
}

const RED = "rgb(255, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

test("after a reload, edit mode brings back the canvas and its changes as they were", async ({ page }) => {
  await page.goto(DEV_URL);
  // A page state the reloaded page will not be in.
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  await fillFirstCardRed(page);
  await expect.poll(savedChanges).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toHaveCount(0);
  await enterEditMode(page);

  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  expect(await cardFills(page)).toEqual([RED, RED, RED, WHITE]);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const design = page.getByRole("complementary", { name: "Design" });
  await expect(design.getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FF0000");

  // Editing on carries the same ChangeSet on: the fill still started out white.
  const hex = design.getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("0000ff");
  await hex.press("Enter");
  await expect
    .poll(() => savedChanges()?.map(({ id, property, before, after }: Record<string, unknown>) => ({ id, property, before, after })))
    .toEqual([{ id: 1, property: "fill", before: { type: "solid", color: "#FFFFFF", opacity: 1 }, after: { type: "solid", color: "#0000FF", opacity: 1 } }]);
});

async function backToPreviewMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

test("with changes not yet applied, edit mode comes back to the same canvas wherever preview mode went", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  await fillFirstCardRed(page);
  // Straight back, well within the autosave delay.
  await backToPreviewMode(page);

  // The page is used as usual in preview mode…
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  await enterEditMode(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toHaveCount(0);
  expect(await cardFills(page)).toEqual([RED, RED, RED, WHITE]);
  await backToPreviewMode(page);

  // …and goes to another page.
  await page.goto(`${DEV_URL}/elsewhere`);
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toHaveCount(0);
  expect(await cardFills(page)).toEqual([RED, RED, RED, WHITE]);
});

test("with no changes left, edit mode freezes the page afresh", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  await fillFirstCardRed(page);
  await expect.poll(savedChanges).toHaveLength(1);
  // Set back to where it started: no longer a change.
  const hex = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("ffffff");
  await hex.press("Enter");
  await expect.poll(savedChanges).toBeNull();
  await backToPreviewMode(page);

  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);

  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  expect(await cardFills(page)).toEqual([WHITE, WHITE, WHITE, WHITE]);
});

test("a badge on the toggle counts the changes not yet applied", async ({ page }) => {
  await page.goto(DEV_URL);
  const badge = page.getByRole("button", { name: /not applied yet/ });
  await expect(badge).toHaveCount(0);

  await enterEditMode(page);
  await fillFirstCardRed(page);
  await expect(badge).toHaveText("1");
  await expect(badge).toHaveAccessibleName("1 change not applied yet");
  const radius = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius" });
  await radius.fill("4");
  await radius.press("Enter");
  await expect(badge).toHaveText("2");
  await backToPreviewMode(page);
  await expect(badge).toHaveText("2");

  await expect.poll(savedChanges).toHaveLength(2);
  await page.reload();
  await expect(badge).toHaveAccessibleName("2 changes not applied yet");
});
