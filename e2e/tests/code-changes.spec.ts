import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { STALL_MS } from "../../packages/03kind/src/client/agent-stall";
import { canvasUpdatedNotice, canvasUpdatedNoticesShown, pageChangedNotice, pageChangedNoticesShown, recordNotices, stalledNotice } from "../bench/notices";
import { canvasInPlace, expect, test, type Page } from "./fixtures";
import { clearThirdKindFolder, EXAMPLE, forTheLoopAlone, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind, servesAsWritten } from "./project-files";

/**
 * The code changing while the designer is in edit mode, with no Agent having
 * claimed the round (ticket 78): told by what the page does, once the code
 * has rested about a second and the designer is done with what they were
 * doing. A change of the canvas shown, the round is claimed for the Agent
 * applying it; the page drawing the same, nothing; the page changed, a canvas
 * with no changes is frozen afresh, and one with changes says so at its
 * bottom left. A file the page does not use, the editor layer's own saves
 * and an Agent applying a claimed round tell nothing. The playbooks in
 * `applying-bench.spec.ts` measure the four cases.
 */

/** These tests save into the example project's `.03kind/` for real, and edit its source. */
test.use({ keepRoundInMemory: false });

const CARD = `${EXAMPLE}src/components/Card.tsx`;
const original = readFileSync(CARD, "utf8");
/** Files the page does not use, put in the project and taken out again. */
const UNUSED = [`${EXAMPLE}notes.md`, `${EXAMPLE}src/unused.ts`];

test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterEach(async () => {
  for (const file of UNUSED) rmSync(file, { force: true });
  if (readFileSync(CARD, "utf8") !== original) writeFileSync(CARD, original);
  // The next test's page must open on the Card as it was.
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text(), original)).toBe(true);
});
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

const canvas = (page: Page) => page.locator('iframe[title="Canvas"]').contentFrame();
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layer = (page: Page, name: string) => page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).first();
const savedChanges = () => readThirdKindFile("changeset.json")?.changes.length ?? 0;
/** The first card's title on the canvas. The canvas is frozen afresh as the code changes: wait on its size with `toHaveCSS`, which reads it again in the new frame, where a read in `expect.poll` fails on the old one going away. */
const canvasTitleOf = (page: Page) => canvas(page).locator("article h3").first();
/** The first card's title size on the canvas: 18px as the code is, 20px once `titleUp` is in and the canvas frozen afresh. */
const canvasTitle = (page: Page) => canvasTitleOf(page).evaluate((h3) => getComputedStyle(h3).fontSize);
/** Every toast or notice the code changing may bring, so far. */
const told = async (page: Page) => ({ updated: (await canvasUpdatedNoticesShown(page)).length, changed: (await pageChangedNoticesShown(page)).length });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** The designer's round: the cards' corners at 4px, saved. */
async function designARound(page: Page) {
  await enterEditMode(page);
  await layer(page, "Card").click();
  await setField(page, "Corner radius", "4");
  await expect.poll(savedChanges).toBe(1);
}

/** Someone changes the Card's code so the page draws its titles a size up: none of the designer's changes. Resolves once the page has it. */
async function titleUp(page: Page) {
  writeFileSync(CARD, readFileSync(CARD, "utf8").replace("text-lg font-semibold", "text-xl font-semibold"));
  await expect.poll(() => page.locator("article h3").first().evaluate((h3) => getComputedStyle(h3).fontSize)).toBe("20px");
}

/** The toggle, locked while the round is applied. */
const ring = (page: Page) => page.getByRole("progressbar", { name: "Applying design changes" });

test("the Agent landing a change with no claim: the round is claimed as if it had, the editor folds away, and the Agent stopping is told as for any claim; ended by hand, it is the designer's again", async ({ page }) => {
  await page.clock.install();
  await recordNotices(page);
  await page.goto(DEV_URL);
  await designARound(page);

  // For the loop's cards alone, as the change is for their usage: written into the Card itself, the fourth card's corners would change too, a leak the page finds since ticket 82 (it notes the other usages as the code begins to change).
  writeFileSync(CARD, forTheLoopAlone(original, "rounded-xl", "rounded-[4px]"));

  await expect(ring(page)).toHaveAttribute("aria-valuenow", "1");
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  expect(readThirdKindFile("state.json")).toMatchObject({ status: "claimed", done: [] });
  // The Agent, told nothing by the Skill, runs claim at last: claimed already, with all of it applied, as the page shows.
  expect(await npx03kind("claim")).toMatch(/^This round is claimed already, and all 1 of its changes are applied/);
  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });

  // It stops: the toggle says so, as after any claim (ticket 67); the designer ends the round by holding the toggle.
  await page.clock.fastForward(STALL_MS + 1000);
  await expect(stalledNotice(page)).toBeVisible();
  await page.getByRole("button", { name: /^03Kind: applying design changes/ }).hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();
  const history = `${THIRD_KIND_FOLDER}history/`;
  await expect.poll(() => readdirSync(history).length).toBe(1);
  expect(JSON.parse(readFileSync(`${history}${readdirSync(history)[0]}/result.json`, "utf8"))).toMatchObject({ ended: "unlocked", applied: [1] });
});

test("a file the page does not use tells nothing: a note, a module nothing imports", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await enterEditMode(page);
  const before = await canvasTitle(page);

  // Class names in them, even: the page's CSS is made from what it uses.
  writeFileSync(UNUSED[0], "Notes for later: bg-red-500 p-77\n");
  writeFileSync(UNUSED[1], "export const later = 'bg-green-600 m-99';\n");
  await page.waitForTimeout(1500);
  writeFileSync(UNUSED[0], "Notes for later, again: text-9xl\n");
  writeFileSync(UNUSED[1], "export const later = 'bg-blue-600';\n");
  await page.waitForTimeout(2500);

  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });
  await expect(canvasTitleOf(page)).toHaveCSS("font-size", before);
  await layer(page, "Button").click();
  await setField(page, "Corner radius", "8");
  await expect.poll(savedChanges).toBe(1);
});

test("the editor layer's own saves tell nothing: the round, the layers off the canvas, the canvas itself", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await designARound(page);
  for (const [field, value] of [["Fill color", "ff0000"], ["Stroke color", "0000ff"], ["Corner radius", "6"]]) {
    await setField(page, field, value);
    await page.waitForTimeout(700);
  }
  await expect.poll(savedChanges).toBe(3);
  // Off the canvas: saved apart, in `.03kind/off-canvas.json`.
  const view = (await page.locator('iframe[title="Canvas"]').boundingBox())!;
  const title = (await canvas(page).locator("h1").boundingBox())!;
  await layer(page, "Third Kind").click();
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(savedChanges).toBe(4);
  await expect.poll(() => readThirdKindFile("off-canvas.json")?.layers.length).toBe(1);
  // Back to preview mode saves the canvas at once; in again, the round comes back.
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("article").first()).toBeVisible();
  await page.waitForTimeout(2000);

  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });
  expect(readThirdKindFile("state.json")).toBeNull();
});

test("the Agent claiming and editing at once tells nothing, even with the page never told of the claim: it asks the local service", async ({ page }) => {
  await recordNotices(page);
  // The page hears the round is being edited, and nothing after: it is told of no claim.
  await page.route(
    (url) => url.hostname === "127.0.0.1" && url.pathname === "/events",
    (route) =>
      route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": route.request().headers().origin ?? "*", "Access-Control-Allow-Headers": "X-03Kind-Token, Content-Type" },
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({ status: "editing" })}\n`,
      }),
  );
  await page.goto(DEV_URL);
  await designARound(page);
  await npx03kind("claim");
  const claimed = readFileSync(`${THIRD_KIND_FOLDER}state.json`, "utf8");

  await titleUp(page);
  await page.waitForTimeout(2500);

  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });
  // The claim is the command line's, as it made it.
  expect(readFileSync(`${THIRD_KIND_FOLDER}state.json`, "utf8")).toBe(claimed);
  await page.unroute((url) => url.hostname === "127.0.0.1" && url.pathname === "/events");
  await npx03kind("finish");
});

test("a press held as the page changes ends first, as the designer meant it; then the page is told of", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await enterEditMode(page);
  // The title dragged out of the canvas, held there, not let go yet.
  const view = (await page.locator('iframe[title="Canvas"]').boundingBox())!;
  const title = (await canvas(page).locator("h1").boundingBox())!;
  await page.mouse.move(title.x + 10, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });

  await titleUp(page);
  await page.waitForTimeout(2000);
  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });

  await page.mouse.up();
  // The drag was an edit, made before: what was pressed is off the canvas, a deletion on the page; so the canvas has a change, and is not frozen afresh.
  await expect(pageChangedNotice(page)).toBeVisible();
  await expect.poll(savedChanges).toBe(1);
  await expect(canvasTitleOf(page)).toHaveCSS("font-size", "18px");
  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 1 });
});

test("words typed and not yet set, in a field or a text layer, are let be till they are: none is lost", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await enterEditMode(page);
  await layer(page, "Card").click();
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).fill("00ff00");

  await titleUp(page);
  await page.waitForTimeout(2000);
  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 0 });

  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).press("Enter");
  // Set: the canvas has a change, and so says the page changed, rather than freezing it afresh.
  await expect(pageChangedNotice(page)).toBeVisible();
  await expect.poll(() => canvas(page).locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(0, 255, 0)");
  await expect.poll(savedChanges).toBe(1);

  // A text layer typed in on the canvas, and the page changing again: told of once the typing is done (and no more, being stale already).
  await layer(page, "Third Kind").click();
  await canvas(page).locator("h1").dblclick();
  await page.keyboard.type("Third");
  writeFileSync(CARD, readFileSync(CARD, "utf8").replace("mt-2 text-sm", "mt-2 text-base"));
  await page.waitForTimeout(2500);
  await expect(canvas(page).locator("h1")).toHaveText("Third");
  await page.keyboard.press("Escape");
  await expect.poll(savedChanges).toBe(2);
  await expect.poll(() => told(page)).toEqual({ updated: 0, changed: 1 });
});

test("files saved one after another, as an Agent writes several, are told once", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await enterEditMode(page);
  const sizes = ["text-xl", "text-2xl", "text-3xl"];
  let text = original;
  for (const [i, size] of sizes.entries()) {
    text = text.replace(i ? sizes[i - 1] : "text-lg", size);
    writeFileSync(CARD, text);
    await page.waitForTimeout(400);
  }
  await expect(canvasTitleOf(page)).toHaveCSS("font-size", "30px");
  await page.waitForTimeout(2000);
  await expect.poll(() => told(page)).toEqual({ updated: 1, changed: 0 });
});

test("the toasts: at the canvas's bottom left, by the Layers panel or the window's edge; apart from the toast at its bottom middle; each gone on its own, but not under the pointer", async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
  const viewport = page.viewportSize()!;
  /** Where a toast is, once it has come in. */
  const at = async (notice: string) => {
    const toast = page.locator(`[data-tk-notice="${notice}"]`);
    await expect.poll(() => toast.evaluate((el) => el.getAnimations().length)).toBe(0);
    return (await toast.boundingBox())!;
  };

  // Frozen afresh: by the Layers panel, told for about 3 seconds; under the pointer, as long as it is there.
  const panel = (await page.getByRole("complementary", { name: "Layers" }).boundingBox())!;
  await titleUp(page);
  const updated = canvasUpdatedNotice(page);
  await expect(updated).toHaveText("Canvas updated to the latest page");
  let box = await at("canvas-updated");
  expect(box.x).toBe(panel.x + panel.width + 16);
  expect(viewport.height - (box.y + box.height)).toBe(16);
  await updated.hover();
  await page.waitForTimeout(4500);
  await expect(updated).toBeVisible();
  await page.mouse.move(viewport.width / 2, 40);
  await expect(updated).toHaveCount(0, { timeout: 4000 });

  // With changes, the page changed: the Layers panel hidden, by the window's left edge; beside the toast at the bottom middle, which takes nothing of its place.
  await layer(page, "Card").click();
  await page.getByRole("button", { name: "Hide layers" }).click();
  await setField(page, "Corner radius", "4");
  writeFileSync(CARD, readFileSync(CARD, "utf8").replace("mt-2 text-sm", "mt-2 text-base"));
  const changed = pageChangedNotice(page);
  await expect(changed).toBeVisible();
  const shownAt = Date.now();
  box = await at("page-changed");
  expect(box.x).toBe(16);
  expect(viewport.height - (box.y + box.height)).toBe(16);
  await setField(page, "Stroke weight", "1.3");
  await expect(page.locator(".tk-toast").filter({ hasText: "Stroke weights go in 0.5px steps" })).toBeVisible();
  await expect(changed).toBeVisible();
  // About 8 seconds, then its fade.
  await expect(changed).toHaveCount(0, { timeout: 12_000 });
  const gone = Date.now() - shownAt;
  expect(gone).toBeGreaterThan(7500);
  expect(gone).toBeLessThan(10_000);
});
