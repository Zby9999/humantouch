import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

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
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });

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

test("an edit not yet saved when the Agent claims stays out of the round", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  // Claimed well within the autosave delay of this edit.
  await setField(page, "Corner radius", "6");
  await vernierkit("claim");

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("aria-valuemax", "2");
  expect(readVernier("changeset.json").changes[1].after).toBe(2);
});

test("while the round is being applied, the change list only shows what is left to do", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  await vernierkit("claim");
  await vernierkit("done", "1");
  await expect(badge(page)).toHaveText("1");

  await badge(page).click();
  const list = page.getByRole("dialog", { name: "Changes" });

  await expect(list.getByText("The Agent is applying these changes.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([/Corner radius.*Card.*12px → 2px/]);
  await expect(list.getByRole("button")).toHaveCount(0);
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
  expect(readVernier("state.json")).toMatchObject({ status: "claimed", done: [] });
});

/** A computed style of every card on the live page, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius") {
  return page.locator("article").evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

const WHITE = "rgb(255, 255, 255)";

test("the page shows the code all along: before the claim, while the round is applied, and after it", async ({ page }) => {
  await page.goto(DEV_URL);
  await changeTheCards(page);
  expect(await cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);

  await vernierkit("claim");
  await vernierkit("done", "1");
  expect(await cardStyles(page, "backgroundColor")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await vernierkit("finish");
  expect(await cardStyles(page, "borderRadius")).toEqual(["12px", "12px", "12px", "12px"]);
});


test.describe("done checks the change on the page", () => {
  const APP = `${EXAMPLE}src/App.tsx`;
  const CSS = `${EXAMPLE}src/index.css`;
  const CARD = `${EXAMPLE}src/components/Card.tsx`;
  const originals = { [APP]: readFileSync(APP, "utf8"), [CSS]: readFileSync(CSS, "utf8"), [CARD]: readFileSync(CARD, "utf8") };
  test.afterEach(() => {
    for (const [file, text] of Object.entries(originals)) writeFileSync(file, text);
  });

  /** As the Agent does: an edit to the example's source, which the dev server brings into the page. */
  function editSource(file: string, from: string, to: string) {
    const text = readFileSync(file, "utf8");
    expect(text).toContain(from);
    writeFileSync(file, text.replace(from, to));
  }

  test("a change the code really makes is shown; one a page rule overrides is not, until it is fixed", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // A utility class: the example's own `button` rule, in no CSS layer, beats it.
    editSource(APP, 'className="mt-6 flex items-center gap-2 self-start px-4 py-2 text-white"', 'className="mt-6 flex items-center gap-2 self-start bg-[#2563eb] px-4 py-2 text-white"');
    const overridden = await vernierkit("done", "1");
    expect(overridden).toContain("Checked on the page: it does not show the change. The fill is #DC2626, not #2563EB.");

    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    const fixed = await vernierkit("done", "1");
    expect(fixed).toContain("Checked on the page: it shows the change.");

    expect(await vernierkit("finish")).toBe("Round finished: 1 of 1 change applied.\n");
    expect(results()).toMatchObject([{ checks: { 1: { outcome: "shown" } } }]);
  });

  test("a layout change is checked in design language: the button fills its Stack once the code stretches it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(1);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    editSource(APP, "flex items-center gap-2 self-start px-4", "flex items-center gap-2 self-stretch px-4");

    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
  });

  test("a change made in the phone view is checked at the phone's width, though the window is wider", async ({ page }) => {
    await page.goto(DEV_URL);
    await page.getByRole("button", { name: TOGGLE_LABEL }).click();
    const phone = page.locator('iframe[title="Phone 390"]');
    await expect(phone.contentFrame().locator("h1")).toBeVisible();
    const box = (await phone.contentFrame().locator("article").first().boundingBox())!;
    await page.keyboard.down("Meta");
    await page.mouse.click(box.x + 4, box.y + 4);
    await page.keyboard.up("Meta");
    await setField(page, "Fill color", "ff0000");
    await expect.poll(() => readVernier("changeset.json")?.changes[0]?.breakpoint?.max).toBe(640);
    await vernierkit("claim");
    await expect(progress(page)).toHaveAttribute("aria-valuemax", "1");

    // Not applied yet: the cards are white at the phone's width too.
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it does not show the change. The fill is #FFFFFF, not #FF0000.");
    // Applied below `sm` only, as the notes say: the window, 1280px wide, still shows them white.
    editSource(CARD, "bg-white p-5", "bg-white p-5 max-sm:bg-[#ff0000]");
    expect(await vernierkit("done", "1")).toContain("Checked on the page: it shows the change.");
    await expect(page.locator("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // Only the page itself is left: the one loaded at the phone's width is gone.
    await expect(page.locator("iframe[data-vk-check]")).toHaveCount(0);
  });

  test("an edit that moves the layer's lines in its file: the check still finds it", async ({ page }) => {
    await page.goto(DEV_URL);
    await enterEditMode(page);
    const layers = page.getByRole("tree", { name: "Layers" });
    await layers.getByRole("treeitem", { name: "Header", exact: true }).click();
    await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
    await setField(page, "Fill color", "e8f0ff");
    await layers.getByRole("treeitem", { name: "Button", exact: true }).click();
    await setField(page, "Fill color", "2563eb");
    await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(2);
    await vernierkit("claim");

    // Applying the button's fill, the Agent adds a line at the top of App.tsx: every marker below moves.
    editSource(CSS, "background: rgb(220, 38, 38);", "background: #2563eb;");
    editSource(APP, 'import { Badge, Surface } from "acme-ui";', '// Buttons are blue now.\nimport { Badge, Surface } from "acme-ui";');

    expect(await vernierkit("done", "2")).toContain("Checked on the page: it shows the change.");
  });
});
