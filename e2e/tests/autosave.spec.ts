import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";
import { clearThirdKind, npx03kind } from "./project-files";

/** These tests save into the example project's `.03kind/` for real, so they go one at a time. */
test.use({ keepRoundInMemory: false });
test.describe.configure({ mode: "serial" });

const THIRD_KIND = fileURLToPath(new URL("../../examples/vite-react19-tw4/.03kind/", import.meta.url));
const CHANGESET = `${THIRD_KIND}changeset.json`;
const CANVAS = `${THIRD_KIND}canvas.html`;

test.beforeEach(() => clearThirdKind(THIRD_KIND));
test.afterAll(() => clearThirdKind(THIRD_KIND));

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
  // In the canvas's edit styles, over the page's.
  expect(saved).toMatch(/background-color:rgb\(255 0 0 \/ 1\)!important/);
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

/**
 * A round saved before the instances of a layer shared their edit styles
 * (ticket 60): `e2e/fixtures/round-before-60/`, written once by the code of
 * then, with `VK_WRITE_FIXTURE` set, and kept since.
 *
 * A saved round names files by where they are on disk: the source a style
 * comes from, and the fonts the canvas loads through Vite's `/@fs/`. The
 * fixture writes this checkout's folder as `CHECKOUT_MARK`, and each test puts
 * its own checkout's folder back in, so the fixture works in any checkout.
 */
const BEFORE_60 = fileURLToPath(new URL("../fixtures/round-before-60/", import.meta.url));
const CHECKOUT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const CHECKOUT_MARK = "{{checkout}}";

/** A file of the fixture, as this checkout would have saved it. */
function readBefore60(file: string) {
  return readFileSync(`${BEFORE_60}${file}`, "utf8").replaceAll(CHECKOUT_MARK, CHECKOUT);
}

function writeBefore60(file: string, text: string) {
  writeFileSync(`${BEFORE_60}${file}`, text.replaceAll(CHECKOUT, CHECKOUT_MARK));
}
const VIEWS = ["Canvas", "Tablet 768", "Phone 390"];
/** What is compared of each element, in each view. */
const COMPARED = ["display", "position", "width", "height", "background-color", "border-top-left-radius", "padding-top", "color"];

/** Each view, by its title: every element of its body, in page order, with the properties compared. */
function viewStyles(page: Page): Promise<Record<string, string[][]>> {
  return Promise.all(
    VIEWS.map(async (title) => {
      const styles = await page
        .locator(`iframe[title="${title}"]`)
        .contentFrame()
        .locator("body")
        .evaluate((body, names) => [...body.querySelectorAll("*")].map((el) => [el.localName, ...names.map((name) => getComputedStyle(el).getPropertyValue(name))]), COMPARED);
      return [title, styles] as const;
    }),
  ).then(Object.fromEntries);
}

/** Selects, in a view, the deepest layer just inside the top left of what `selector` finds: the view is the one worked in from then on. */
async function pick(page: Page, view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

async function enterEveryView(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  for (const title of VIEWS) await expect(page.locator(`iframe[title="${title}"]`).contentFrame().locator("h1")).toBeVisible();
}

test.describe("a round saved before the instances of a layer shared their edit styles", () => {
  test.skip(!process.env.VK_WRITE_FIXTURE, "writes the fixture, with the code of then");
  // Written once, by the code of then: never over the one kept.
  test.skip(existsSync(BEFORE_60), "the fixture is kept: written by the code of then");
  test("is written", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEveryView(page);
    const layers = page.getByRole("tree", { name: "Layers" });
    // The three Cards of the loop: at every width, at the phone's breakpoint, and one of them deleted alone.
    await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
    await setField(page, "Fill color", "ff0000");
    await setField(page, "Corner radius", "4");
    await pick(page, page.locator('iframe[title="Phone 390"]'), "article");
    await setField(page, "Corner radius", "20");
    await layers.getByRole("treeitem", { name: "Card", exact: true }).nth(1).click();
    await page.keyboard.press("Delete");
    await expect.poll(savedChanges).toHaveLength(4);
    await page.waitForTimeout(1000);

    mkdirSync(BEFORE_60, { recursive: true });
    writeBefore60("canvas.html", readFileSync(CANVAS, "utf8"));
    writeBefore60("changeset.json", readFileSync(CHANGESET, "utf8"));
    writeBefore60("styles.json", `${JSON.stringify(await viewStyles(page))}\n`);
    writeBefore60("claim.md", await npx03kind("claim"));
  });
});

test("a round saved before the instances of a layer shared their edit styles opens as it was in every view; edits go on and are undone, and the notes of each change are as they were", async ({ page }) => {
  mkdirSync(THIRD_KIND, { recursive: true });
  for (const file of ["canvas.html", "changeset.json"]) writeFileSync(`${THIRD_KIND}${file}`, readBefore60(file));
  const before = JSON.parse(readBefore60("styles.json"));
  const changeSet = JSON.parse(readBefore60("changeset.json"));

  await page.goto(DEV_URL);
  await enterEveryView(page);
  await expect.poll(() => viewStyles(page)).toEqual(before);
  expect(readFileSync(CHANGESET, "utf8")).toBe(readBefore60("changeset.json"));

  // The Cards of the loop, the one deleted alone left out.
  const radii = () =>
    Promise.all(VIEWS.map((title) => page.locator(`iframe[title="${title}"]`).contentFrame().locator("article:visible").evaluateAll((cards) => cards.slice(0, 2).map((card) => getComputedStyle(card).borderTopLeftRadius))));
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Corner radius", "8");
  await expect.poll(radii).toEqual([["8px", "8px"], ["8px", "8px"], ["20px", "20px"]]);
  await expect.poll(() => savedChanges()?.find((change: { property: string; breakpoint?: object }) => change.property === "radius" && !change.breakpoint)?.after).toBe(8);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => viewStyles(page)).toEqual(before);
  await expect.poll(() => JSON.parse(readFileSync(CHANGESET, "utf8"))).toEqual(changeSet);
  // Each change's notes as they were; what goes around them, the way through the round and how to write them, is of the notes of now (ticket 65).
  expect(changeSections(await npx03kind("claim"))).toBe(changeSections(readBefore60("claim.md")));
});

/** The change notes' sections of the changes, one after another: what is said around them left out. */
function changeSections(notes: string) {
  return notes
    .split(/^## /m)
    .filter((part) => /^\d+\. /.test(part))
    .join("## ");
}
