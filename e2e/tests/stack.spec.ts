import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

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

const HERO = '[data-testid="hero"]';
const PARAGRAPH = "A Framer-style editor layer for any page.";

/** Where each element is on the canvas, in canvas px. */
function boxes(page: Page, selector: string) {
  return canvas(page)
    .locator(selector)
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
}

/** The rows of the layer tree: depth, name and type. */
function rows(page: Page) {
  return layerTree(page)
    .getByRole("treeitem")
    .evaluateAll((items) => items.map((item) => `${item.getAttribute("aria-level")} ${item.textContent} · ${item.getAttribute("aria-description")}`));
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("⇧A makes the selected layers a Stack where they are, which is selected; ⌘Z takes it back", async ({ page }) => {
  await enterEditMode(page);
  const before = await boxes(page, `${HERO} > p, ${HERO} > button`);
  await layerTree(page).getByRole("treeitem", { name: PARAGRAPH, exact: true }).click();
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click({ modifiers: ["Shift"] });

  await page.keyboard.press("Shift+A");

  expect(await canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "div"]);
  expect(await canvas(page).locator(`${HERO} > div > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["p", "button"]);
  // In the Stack they are as they were to each other; the paragraph's margin above goes with it (the Stack has none).
  const after = await boxes(page, `${HERO} > div > p, ${HERO} > div > button`);
  const shift = after[0].y - before[0].y;
  after.forEach((box, i) => {
    expect(Math.abs(box.x - before[i].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - shift - before[i].y)).toBeLessThanOrEqual(1);
  });
  const selected = layerTree(page).locator('[role="treeitem"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAccessibleName("Stack");
  await expect(selected).toHaveAttribute("aria-level", "4");
  await expect(selected).toHaveAttribute("aria-description", "Vertical Stack");
  await expect(page.getByRole("button", { name: "1 change not applied yet" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  expect(await canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.map((el) => el.localName))).toEqual(["header", "p", "button"]);
});

test("absolute layers in a Frame make a horizontal Stack, absolute where they were; the Design panel makes one too", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px";
    for (const [id, left] of [["one", 20], ["two", 140], ["three", 264]] as const) {
      const box = Object.assign(document.createElement("div"), { id });
      box.style.cssText = `position: absolute; left: ${left}px; top: 30px; width: 100px; height: 40px; background: #ccc`;
      board.append(box);
    }
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  const before = await boxes(page, "#one, #two, #three");
  const frame = layerTree(page).getByRole("treeitem").last();
  await frame.click();
  // Its layers are the last three rows.
  const boxRows = layerTree(page).getByRole("treeitem").filter({ hasText: /^Frame$/ });
  await expect(boxRows).toHaveCount(4);
  await boxRows.nth(1).click();
  await boxRows.nth(2).click({ modifiers: ["Shift"] });
  await boxRows.nth(3).click({ modifiers: ["Shift"] });

  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Make Stack" }).click();

  expect((await rows(page)).slice(-5)).toEqual(["3 Frame · Frame", "4 Stack · Horizontal Stack · Absolute", "5 Frame · Frame", "5 Frame · Frame", "5 Frame · Frame"]);
  const after = await boxes(page, "#one, #two, #three");
  after.forEach((box, i) => expect(Math.abs(box.x - before[i].x)).toBeLessThanOrEqual(4));
  // Spaces of 20 and 24px: their median is 22.
  await expect(page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Gap" })).toHaveValue("22");
});

test("a Stack dissolved from the Design panel is a Frame, its layers absolute where they were", async ({ page }) => {
  await enterEditMode(page);
  const before = await boxes(page, `${HERO} > header, ${HERO} > header > *`);
  await layerTree(page).getByRole("treeitem", { name: "Header", exact: true }).click();

  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Dissolve Stack" }).click();

  // Where they were, to the layout's own rounding.
  (await boxes(page, `${HERO} > header, ${HERO} > header > *`)).forEach((box, i) => {
    for (const side of ["x", "y", "width", "height"] as const) expect(Math.abs(box[side] - before[i][side])).toBeLessThan(0.1);
  });
  await expect(layerTree(page).getByRole("treeitem", { name: "Header", exact: true })).toHaveAttribute("aria-description", "Frame");
  await expect(layerTree(page).getByRole("treeitem", { name: "03Kind", exact: true })).toHaveAttribute("aria-description", "Text · Absolute");
  await expect(page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Dissolve Stack" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Alt+Shift+A");
  await expect(layerTree(page).getByRole("treeitem", { name: "Header", exact: true })).toHaveAttribute("aria-description", "Frame");
});

test("making and dissolving Stacks are listed as such", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Header", exact: true }).click();
  await page.keyboard.press("Alt+Shift+A");
  await layerTree(page).getByRole("treeitem", { name: PARAGRAPH, exact: true }).click();
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Shift+A");
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await page.getByRole("button", { name: /not applied yet/ }).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([
    /Dissolve Stack.*Header.*horizontal Stack → Frame/,
    // The button's margin above it is the gap now.
    /Make Stack.*Stack.*2 layers, vertical, gap 24px/,
  ]);
});

test("⌘⇧G ungroups: the Header's layers take its place in the hero's layout, in order, and the Header goes", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Header", exact: true }).click();

  await page.keyboard.press("ControlOrMeta+Shift+G");

  await expect(layerTree(page).getByRole("treeitem", { name: "Header", exact: true })).toHaveCount(0);
  await expect(layerTree(page).getByRole("treeitem", { selected: true })).toHaveCount(2);
  const shown = await canvas(page).locator(`${HERO} > *`).evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== "none").map((el) => el.localName));
  expect(shown).toEqual(["h1", "span", "p", "button"]);
  await page.getByRole("button", { name: /not applied yet/ }).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/Move/, /Move/, /Delete.*Header/]);
});
