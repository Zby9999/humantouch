import { expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const views = (page: Page) => [desktop(page), tablet(page), phone(page)];
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers" });
const field = (page: Page, name: string) => design(page).getByRole("textbox", { name, exact: true });

/** The feature cards' Grid: `grid grid-cols-1 gap-4 sm:grid-cols-3`. */
const GRID = "main > div:has(> article)";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
}

/** Selects the Grid in a view, from its first card, a level up: the view is the one worked in from then on. */
async function pickGrid(page: Page, view: Locator) {
  const box = (await view.contentFrame().locator("article").first().boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
  await page.keyboard.press("Escape");
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true })).toHaveAttribute("aria-selected", "true");
}

async function setField(page: Page, name: string, value: string) {
  await field(page, name).fill(value);
  await field(page, name).press("Enter");
}

/** How many columns the Grid has, and its row and column gaps, in each view: desktop, tablet, phone. */
function grids(page: Page) {
  return Promise.all(
    views(page).map((view) =>
      view
        .contentFrame()
        .locator(GRID)
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.gridTemplateColumns.split(" ").length, style.rowGap, style.columnGap].join(" ");
        }),
    ),
  );
}

/** The cards' titles, in order, in each view. */
function cards(page: Page) {
  return Promise.all(views(page).map((view) => view.contentFrame().locator("article h3").allTextContents()));
}

async function changeRows(page: Page) {
  await page.locator("[data-vk-changes-opener]").click();
  return page.getByRole("dialog", { name: "Changes" }).getByRole("listitem");
}

const ORDER = ["Freeze", "Arrange", "Apply", "Your turn"];

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a Grid shows its columns and gaps in the panel; changed there, every view shows the new columns and gaps at once", async ({ page }) => {
  await enterEditMode(page);
  await pickGrid(page, desktop(page));

  const section = design(page).getByRole("region", { name: "Grid" });
  await expect(section).toBeVisible();
  await expect(field(page, "Columns")).toHaveValue("3");
  await expect(field(page, "Row gap")).toHaveValue("16");
  await expect(field(page, "Column gap")).toHaveValue("16");
  // A Grid is no Stack: it has no direction or padding of its own.
  await expect(design(page).getByRole("region", { name: "Stack" })).toHaveCount(0);

  await setField(page, "Columns", "2");
  await setField(page, "Column gap", "40");
  await expect.poll(() => grids(page)).toEqual(["2 16px 40px", "2 16px 40px", "2 16px 40px"]);
  await expect(field(page, "Columns")).toHaveValue("2");

  // Two cells to a row: the third card starts the second row.
  const [first, third] = [desktop(page).contentFrame().locator("article").nth(0), desktop(page).contentFrame().locator("article").nth(2)];
  expect((await third.boundingBox())!.x).toBeCloseTo((await first.boundingBox())!.x, 0);

  await expect(await changeRows(page)).toHaveText([/Columns.*Grid.*3 → 2/, /Column gap.*Grid.*16px → 40px/]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  await expect.poll(() => grids(page)).toEqual(["3 16px 16px", "3 16px 16px", "1 16px 16px"]);
});

test("in the phone view, the Grid's columns and gaps change at its breakpoint only, and reset, inherit again", async ({ page }) => {
  await enterEditMode(page);
  await pickGrid(page, phone(page));
  await expect(field(page, "Columns")).toHaveValue("1");

  await setField(page, "Columns", "2");
  await setField(page, "Row gap", "8");
  await expect.poll(() => grids(page)).toEqual(["3 16px 16px", "3 16px 16px", "2 8px 16px"]);

  const breakpoint = design(page).getByRole("region", { name: "Phone breakpoint" });
  await expect(breakpoint.getByRole("listitem")).toHaveText(["Columns", "Row gap"]);
  // Each row marked where it is: Columns on its own, the gaps on theirs.
  const grid = design(page).getByRole("region", { name: "Grid" });
  await expect(grid.getByRole("button", { name: "Reset Row gap to inherit" })).toBeVisible();
  await grid.getByRole("button", { name: "Reset Columns to inherit" }).click();
  await expect(grid.getByRole("button", { name: "Reset Columns to inherit" })).toHaveCount(0);
  await expect.poll(() => grids(page)).toEqual(["3 16px 16px", "3 16px 16px", "1 8px 16px"]);
  await expect(field(page, "Columns")).toHaveValue("1");
  await expect(await changeRows(page)).toHaveText([/Row gap.*Grid.*below 768px/]);
});

test("a card dragged between the cells of the Grid takes that cell, in every view; the others make room while it moves, with a line where it goes", async ({ page }) => {
  await enterEditMode(page);
  await layers(page).getByRole("treeitem", { name: "Card", exact: true }).nth(3).click();
  const turn = desktop(page).contentFrame().locator("article").nth(3);
  const freeze = desktop(page).contentFrame().locator("article").nth(0);

  const start = (await turn.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // Just inside Freeze's left edge: before it, not into it.
  const target = (await freeze.boundingBox())!;
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".vk-drop-line")).toBeVisible();
  // Only shifted while it moves: Freeze steps into the next cell, the structure is as it was.
  await expect(freeze).not.toHaveCSS("translate", "none");
  expect((await cards(page))[0]).toEqual(ORDER);
  await page.mouse.up();

  const moved = ["Your turn", "Freeze", "Arrange", "Apply"];
  await expect.poll(() => cards(page)).toEqual([moved, moved, moved]);
  await expect(page.locator(".vk-drop-line")).toHaveCount(0);
  await expect(freeze).toHaveCSS("translate", "none");
  await expect(await changeRows(page)).toHaveText([/Reorder.*Card.*4th → 1st/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Meta+z");
  await expect.poll(() => cards(page)).toEqual([ORDER, ORDER, ORDER]);
});

test("the arrow keys move a card a cell along the Grid, or a row up or down, and it stays at the ends", async ({ page }) => {
  await enterEditMode(page);
  await layers(page).getByRole("treeitem", { name: "Card", exact: true }).nth(3).click();
  const desktopCards = async () => (await cards(page))[0];

  await page.keyboard.press("ArrowLeft");
  await expect.poll(desktopCards).toEqual(["Freeze", "Arrange", "Your turn", "Apply"]);
  // Three columns: a row up is three cells back, before the first; it stays.
  await page.keyboard.press("ArrowUp");
  await expect.poll(desktopCards).toEqual(["Freeze", "Arrange", "Your turn", "Apply"]);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(desktopCards).toEqual(ORDER);
  await page.keyboard.press("ArrowUp");
  await expect.poll(desktopCards).toEqual(["Your turn", "Freeze", "Arrange", "Apply"]);
  await expect(layers(page).getByRole("treeitem", { name: "Card", exact: true }).nth(0)).toHaveAttribute("aria-selected", "true");
});

test("a layer dragged into the Grid from a Stack takes the cell it is let go at", async ({ page }) => {
  await enterEditMode(page);
  await layers(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const button = desktop(page).contentFrame().locator('[data-testid="hero"] > button');
  const arrange = desktop(page).contentFrame().locator("article").nth(1);

  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const target = (await arrange.boundingBox())!;
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".vk-drop-line")).toBeVisible();
  await page.mouse.up();

  const children = () => desktop(page).contentFrame().locator(GRID).evaluate((el) => [...el.children].map((child) => child.querySelector("h3")?.textContent ?? child.localName));
  await expect.poll(children).toEqual(["Freeze", "button", "Arrange", "Apply", "Your turn"]);
  await expect(await changeRows(page)).toHaveText([/Move.*Button.*Stack → Grid/]);
});

test("in a Grid one of whose cards is placed by order, a card dragged or nudged among the cards stays, with no reorder; a layer dragged in goes last", async ({ page }) => {
  // The first card shown last, whatever the order the cards are written in.
  await page.locator("main article").first().evaluate((el) => ((el as HTMLElement).style.order = "1"));
  await enterEditMode(page);
  await layers(page).getByRole("treeitem", { name: "Card", exact: true }).nth(3).click();
  const turn = desktop(page).contentFrame().locator("article").nth(3);
  const arrange = desktop(page).contentFrame().locator("article").nth(1);

  const start = (await turn.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const target = (await arrange.boundingBox())!;
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".vk-drop-line")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  expect(await cards(page)).toEqual([ORDER, ORDER, ORDER]);
  await expect(page.locator("[data-vk-changes-opener]")).toHaveCount(0);

  await layers(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const button = desktop(page).contentFrame().locator('[data-testid="hero"] > button');
  const from = (await button.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();

  const children = () => desktop(page).contentFrame().locator(GRID).evaluate((el) => [...el.children].map((child) => child.querySelector("h3")?.textContent ?? child.localName));
  await expect.poll(children).toEqual([...ORDER, "button"]);
  await expect(await changeRows(page)).toHaveText([/Move.*Button.*Stack → Grid/]);
});
