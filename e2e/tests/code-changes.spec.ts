import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { recordNotices, unclaimedNotice, unclaimedNoticesShown } from "../bench/notices";
import { expect, test, type Page } from "./fixtures";
import { clearThirdKind, EXAMPLE, readThirdKind, THIRD_KIND, npx03kind } from "./project-files";

/**
 * The code changing while the designer is in edit mode, with no Agent having
 * claimed the round (ticket 66): editing pauses, and the designer is asked
 * what to do. A file the page does not use, the editor layer's own saves and
 * an Agent applying a claimed round never ask.
 */

/** These tests save into the example project's `.03kind/` for real, and edit its source. */
test.use({ keepRoundInMemory: false });

const CARD = `${EXAMPLE}src/components/Card.tsx`;
const original = readFileSync(CARD, "utf8");
/** Files the page does not use, put in the project and taken out again. */
const UNUSED = [`${EXAMPLE}notes.md`, `${EXAMPLE}src/unused.ts`];

test.beforeEach(() => clearThirdKind(THIRD_KIND));
test.afterEach(async () => {
  for (const file of UNUSED) rmSync(file, { force: true });
  if (readFileSync(CARD, "utf8") !== original) writeFileSync(CARD, original);
  // The next test's page must open on the Card as it was.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text()).includes("rounded-xl border border-stone-200 bg-white")).toBe(true);
});
test.afterAll(() => clearThirdKind(THIRD_KIND));

const canvas = (page: Page) => page.locator('iframe[title="Canvas"]').contentFrame();
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layer = (page: Page, name: string) => page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).first();
const savedChanges = () => readThirdKind("changeset.json")?.changes.length ?? 0;
/** The first card's corner radius on the canvas. */
const cardRadius = (page: Page) => canvas(page).locator("article").first().evaluate((card) => getComputedStyle(card).borderTopLeftRadius);
/** The live page's first card fill, as the code has it now. */
const pageFill = (page: Page) => page.locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor);

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
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

/** Someone (an Agent going by the chat, say) changes the Card's code; the dev server brings it into the page. */
async function changeTheCard(page: Page, from = "bg-white", to = "bg-[#ff0000]") {
  writeFileSync(CARD, readFileSync(CARD, "utf8").replace(from, to));
  await expect.poll(() => pageFill(page)).not.toBe("rgb(255, 255, 255)");
}

test("the code changing in edit mode with no claim: editing pauses as the designer is asked, and the canvas keeps every change", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);

  await changeTheCard(page);

  const notice = unclaimedNotice(page);
  await expect(notice).toBeVisible();
  await expect(page.getByRole("alertdialog", { name: "The code is changing, but no Agent has claimed your changes" })).toBeVisible();
  await expect(notice).toContainText("Editing is paused");
  await expect(notice.getByRole("button", { name: "Keep editing" })).toBeFocused();
  // Paused: no key edits the canvas, and nothing behind the notice can be pressed.
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Delete");
  await expect(layer(page, "Button").click({ trial: true, timeout: 1000 })).rejects.toThrow();
  expect(await cardRadius(page)).toBe("4px");
  expect(savedChanges()).toBe(1);
});

/** What has the focus, through the editor layer's Shadow DOM: its tag and name. */
const focused = (page: Page) =>
  page.evaluate(() => {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el && `${el.localName} ${el.getAttribute("aria-label") ?? ""}`;
  });

test("keep editing: the notice goes and editing goes on; the code changing again, after a quiet while, asks again", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);
  const before = await focused(page);
  await changeTheCard(page);
  const notice = unclaimedNotice(page);
  await expect(notice).toBeVisible();

  await notice.getByRole("button", { name: "Keep editing" }).click();

  await expect(notice).toHaveCount(0);
  // The focus is back where it was as the code changed.
  expect(await focused(page)).toBe(before);
  expect(before).not.toMatch(/^(body|html) /);
  await layer(page, "Button").click();
  await setField(page, "Corner radius", "8");
  await expect.poll(savedChanges).toBe(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(savedChanges).toBe(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(savedChanges).toBe(2);
  await expect(notice).toHaveCount(0);

  await changeTheCard(page, "rounded-xl", "rounded-[2px]");
  await expect(notice).toBeVisible();
});

test("back to preview mode: the round is kept, and edit mode comes back to the same canvas", async ({ page }) => {
  await page.goto(DEV_URL);
  // Frozen with the dialog open: a canvas frozen afresh would have it closed.
  await page.getByRole("button", { name: "Get started" }).click();
  await designARound(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  await changeTheCard(page);
  const notice = unclaimedNotice(page);

  await notice.getByRole("button", { name: "Back to preview mode" }).click();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1 change not applied yet" })).toBeVisible();
  expect(savedChanges()).toBe(1);
  await page.getByRole("dialog", { name: "Ship it?" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Ship it?" })).toHaveCount(0);

  await enterEditMode(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  expect(await cardRadius(page)).toBe("4px");
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("button", { name: EXIT_LABEL })).toBeVisible();
});

test("no notice for a file the page does not use: a note, a module nothing imports", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await designARound(page);

  // Class names in them, even: the page's CSS is made from what it uses.
  writeFileSync(UNUSED[0], "Notes for later: bg-red-500 p-77\n");
  writeFileSync(UNUSED[1], "export const later = 'bg-green-600 m-99';\n");
  await page.waitForTimeout(1500);
  writeFileSync(UNUSED[0], "Notes for later, again: text-9xl\n");
  writeFileSync(UNUSED[1], "export const later = 'bg-blue-600';\n");
  await page.waitForTimeout(2500);

  expect(await unclaimedNoticesShown(page)).toEqual([]);
  await layer(page, "Button").click();
  await setField(page, "Corner radius", "8");
  await expect.poll(savedChanges).toBe(2);
});

test("no notice as the editor layer saves the round, the layers off the canvas, or the canvas itself", async ({ page }) => {
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
  await layer(page, "Vernier Kit").click();
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(savedChanges).toBe(4);
  await expect.poll(() => readThirdKind("off-canvas.json")?.layers.length).toBe(1);
  // Back to preview mode saves the canvas at once; in again, the round comes back.
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  // The title is off the canvas now.
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("article").first()).toBeVisible();
  await page.waitForTimeout(2000);

  expect(await unclaimedNoticesShown(page)).toEqual([]);
});

test("no notice as the Agent claims the round and edits the code at once, before the page hears of the claim", async ({ page }) => {
  await recordNotices(page);
  await page.goto(DEV_URL);
  await designARound(page);

  await npx03kind("claim");
  writeFileSync(CARD, original.replace("rounded-xl", "rounded-[4px]"));
  expect(await npx03kind("done", "1")).toContain("it shows the change");
  await expect(page.getByRole("progressbar", { name: "Applying design changes" })).toHaveAttribute("aria-valuenow", "1");
  await npx03kind("finish");
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeEnabled();

  expect(await unclaimedNoticesShown(page)).toEqual([]);
});

test("a press held as the code changes ends first, as the designer meant it; then editing pauses", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);
  // The title dragged out of the canvas, held there, not let go yet.
  const view = (await page.locator('iframe[title="Canvas"]').boundingBox())!;
  const title = (await canvas(page).locator("h1").boundingBox())!;
  await page.mouse.move(title.x + 10, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, title.y, { steps: 10 });

  await changeTheCard(page);
  await page.waitForTimeout(1500);
  const notice = unclaimedNotice(page);
  await expect(notice).toHaveCount(0);

  await page.mouse.up();
  await expect(notice).toBeVisible();
  // The drag was an edit, made before the pause: what was pressed is off the canvas, a deletion on the page.
  await expect.poll(savedChanges).toBe(2);
  expect(readThirdKind("changeset.json").changes.map((change: { kind: string }) => change.kind)).toEqual(["style", "delete"]);
});

test("a value typed, not yet set, is set as the notice takes the focus: no change is lost", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).fill("00ff00");

  await changeTheCard(page);

  await expect(unclaimedNotice(page)).toBeVisible();
  await expect.poll(savedChanges).toBe(2);
  expect(await canvas(page).locator("article").first().evaluate((card) => getComputedStyle(card).backgroundColor)).toBe("rgb(0, 255, 0)");
});

test("the Agent claiming once the notice is up: edit mode folds away as for any claim, and the round is applied as usual", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);
  await changeTheCard(page);
  const notice = unclaimedNotice(page);
  await expect(notice).toBeVisible();

  await npx03kind("claim");

  await expect(notice).toHaveCount(0);
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Applying design changes" })).toBeVisible();
  await npx03kind("finish");
});

test("no notice as the Agent claims and edits at once, even with the page never told of the claim: it asks the local service", async ({ page }) => {
  await recordNotices(page);
  // The page hears the round is being edited, and nothing after: it is told of no claim.
  await page.route(
    (url) => url.hostname === "127.0.0.1" && url.pathname === "/events",
    (route) =>
      route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": route.request().headers().origin ?? "*", "Access-Control-Allow-Headers": "X-Vernier-Token, Content-Type" },
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({ status: "editing" })}\n`,
      }),
  );
  await page.goto(DEV_URL);
  await designARound(page);

  await npx03kind("claim");
  await changeTheCard(page);
  await page.waitForTimeout(2500);

  expect(await unclaimedNoticesShown(page)).toEqual([]);
  await expect(page.locator('iframe[title="Canvas"]')).toBeVisible();
  await page.unroute((url) => url.hostname === "127.0.0.1" && url.pathname === "/events");
  await npx03kind("finish");
});

test("words typed in a text layer on the canvas are set as the notice takes the focus: no change is lost", async ({ page }) => {
  await page.goto(DEV_URL);
  await designARound(page);
  await layer(page, "Vernier Kit").click();
  await canvas(page).locator("h1").dblclick();
  await page.keyboard.type("Vernier");

  await changeTheCard(page);

  await expect(unclaimedNotice(page)).toBeVisible();
  await expect(canvas(page).locator("h1")).toHaveText("Vernier");
  await expect.poll(savedChanges).toBe(2);
});
