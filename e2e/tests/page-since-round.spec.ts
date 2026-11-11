import { readFileSync, statSync, writeFileSync } from "node:fs";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { pageSinceNotice, pageSinceNoticesShown, recordNotices } from "../bench/notices";
import { canvasInPlace, expect, test, type Page } from "./fixtures";
import { clearHumanTouchFolder, EXAMPLE, HUMAN_TOUCH_FOLDER, readHumanTouchFile, servesAsWritten } from "./project-files";

/**
 * Ticket 141: a round with changes left comes back to its canvas (ticket 68),
 * which reflects the page as it was then. The code changed since by hand (not
 * by the Agent applying the round): its styles alone, the canvas takes in the
 * page's stylesheets as they are now, its changes kept, once; its elements,
 * class names or words too, the canvas stays as it was, and says so.
 * Loaded again, the code the same, the page is the same, whatever moves on it.
 */

/** These tests save into the example project's `.humantouch/` for real, and edit its source. */
test.use({ keepRoundInMemory: false });

const CSS = `${EXAMPLE}src/index.css`;
const CARD = `${EXAMPLE}src/components/Card.tsx`;
const originalCss = readFileSync(CSS, "utf8");
const originalCard = readFileSync(CARD, "utf8");
/** What the designer writes into the CSS by hand: a weight of the display font declared, and the body's color. */
const DESIGNER_CSS = originalCss.replace('@import "@fontsource/space-grotesk/700.css";', '@import "@fontsource/space-grotesk/700.css";\n@import "@fontsource/space-grotesk/500.css";').replace("color: rgb(68, 64, 60);", "color: rgb(30, 64, 175);");
const VIEW_TITLES = ["Canvas", "Tablet 768", "Phone 390"];

test.beforeEach(() => clearHumanTouchFolder(HUMAN_TOUCH_FOLDER));
test.afterEach(async () => {
  if (readFileSync(CSS, "utf8") !== originalCss) writeFileSync(CSS, originalCss);
  if (readFileSync(CARD, "utf8") !== originalCard) writeFileSync(CARD, originalCard);
  // The next test's page must open on the code as it was.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/index.css`)).text()).includes("rgb(30, 64, 175)")).toBe(false);
  await expect.poll(async () => servesAsWritten(await (await fetch(`${DEV_URL}/src/components/Card.tsx`)).text(), originalCard)).toBe(true);
});
test.afterAll(() => clearHumanTouchFolder(HUMAN_TOUCH_FOLDER));

const view = (page: Page, title: string) => page.locator(`iframe[title="${title}"]`).contentFrame();
const canvas = (page: Page) => view(page, "Canvas");
const savedChanges = () => readHumanTouchFile("changeset.json")?.changes.length ?? 0;
const savedCanvas = () => readFileSync(`${HUMAN_TOUCH_FOLDER}canvas.html`, "utf8");
const savedAt = () => statSync(`${HUMAN_TOUCH_FOLDER}canvas.html`).mtimeMs;
/** The first card's corners and the body's color, in each view. */
const looks = async (page: Page) => {
  const all: string[][] = [];
  for (const title of VIEW_TITLES) {
    const frame = view(page, title);
    await expect(frame.locator("article").first()).toBeVisible();
    all.push([await frame.locator("article").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), await frame.locator("body").evaluate((el) => getComputedStyle(el).color)]);
  }
  return all;
};

async function enterEditMode(page: Page, selector = "article") {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator(selector).first()).toBeVisible();
  await canvasInPlace(page);
}

async function leaveEditMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

/** The designer's round: the cards' corners at 4px, saved, the page it was frozen from printed. Back in preview mode. */
async function designARound(page: Page, layer = "Card", selector = "article") {
  await recordNotices(page);
  await page.goto(selector === "article" ? DEV_URL : `${DEV_URL}/motion.html`);
  await enterEditMode(page, selector);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: layer, exact: true }).first().click();
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius", exact: true });
  await field.fill("4");
  await field.press("Enter");
  await expect.poll(savedChanges).toBe(1);
  await expect.poll(() => readHumanTouchFile("page.json")).not.toBeNull();
  await leaveEditMode(page);
}

test("styles alone changed by hand: the canvas takes in the page's stylesheets, a new @font-face too, in every view; the change stays, and no notice; once, not again", async ({ page }) => {
  await designARound(page);
  const printed = readHumanTouchFile("page.json");
  writeFileSync(CSS, DESIGNER_CSS);
  await expect.poll(() => page.locator("body").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(30, 64, 175)");

  await enterEditMode(page);
  expect(await looks(page)).toEqual(VIEW_TITLES.map(() => ["4px", "rgb(30, 64, 175)"]));
  await expect.poll(() => canvas(page).locator("body").evaluate(() => [...document.fonts].some((font) => font.family.includes("Space Grotesk") && font.weight === "500"))).toBe(true);
  await expect.poll(() => view(page, "Phone 390").locator("body").evaluate(() => [...document.fonts].some((font) => font.family.includes("Space Grotesk") && font.weight === "500"))).toBe(true);
  await expect(page.getByRole("button", { name: "1 change not applied yet" })).toBeVisible();
  // Saved with them: the page it reflects is the page as it is now.
  await expect.poll(() => savedCanvas().includes("rgb(30, 64, 175)")).toBe(true);
  await expect.poll(() => readHumanTouchFile("page.json")).not.toEqual(printed);
  expect(readHumanTouchFile("page.json").structure).toBe(printed.structure);
  expect(await pageSinceNotice(page).count()).toBe(0);
  await leaveEditMode(page);

  // Again, and after a reload: as it was left, taken in no more.
  const taken = { print: readHumanTouchFile("page.json"), at: savedAt() };
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await enterEditMode(page);
    expect(await looks(page)).toEqual(VIEW_TITLES.map(() => ["4px", "rgb(30, 64, 175)"]));
    await page.waitForTimeout(800);
    await leaveEditMode(page);
  }
  expect(readHumanTouchFile("page.json")).toEqual(taken.print);
  expect(savedAt()).toBe(taken.at);
  expect(savedChanges()).toBe(1);
  expect((await pageSinceNoticesShown(page)).length).toBe(0);
});

test("the structure changed by hand, a class name in the JSX (Tailwind): the canvas stays as it was, and says so", async ({ page }) => {
  await designARound(page);
  const printed = readHumanTouchFile("page.json");
  const before = savedCanvas();
  writeFileSync(CARD, originalCard.replace("text-lg font-semibold", "text-xl font-semibold"));
  await expect.poll(() => page.locator("article h3").first().evaluate((h3) => getComputedStyle(h3).fontSize)).toBe("20px");

  await enterEditMode(page);
  await expect(pageSinceNotice(page)).toBeVisible();
  await expect(pageSinceNotice(page)).toContainText("The page changed after this round began");
  expect(await canvas(page).locator("article h3").first().evaluate((h3) => getComputedStyle(h3).fontSize)).toBe("18px");
  expect(await canvas(page).locator("article").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("4px");
  await leaveEditMode(page);
  // Nothing taken in, nothing saved: the canvas reflects the page it did, and says so each time.
  expect(readHumanTouchFile("page.json")).toEqual(printed);
  expect(savedCanvas()).toBe(before);
  await enterEditMode(page);
  await expect(pageSinceNotice(page)).toBeVisible();
  expect((await pageSinceNoticesShown(page)).length).toBe(2);
});

test("a page that moves, loaded again and again with the code the same, is the same page: no notice, nothing taken in", async ({ page }) => {
  await designARound(page, "Frame", ".spinner");
  const printed = readHumanTouchFile("page.json");
  const at = savedAt();
  for (let load = 0; load < 3; load++) {
    await page.reload();
    // The page moves on meanwhile: the clock, the carousel, the list in another order.
    await page.waitForTimeout(700);
    await enterEditMode(page, ".spinner");
    await page.waitForTimeout(500);
    expect(await pageSinceNotice(page).count()).toBe(0);
    await leaveEditMode(page);
  }
  expect(readHumanTouchFile("page.json")).toEqual(printed);
  expect(savedAt()).toBe(at);
  expect((await pageSinceNoticesShown(page)).length).toBe(0);
});
