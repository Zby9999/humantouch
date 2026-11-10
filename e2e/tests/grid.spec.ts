import { canvasInPlace, expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const views = (page: Page) => [desktop(page), tablet(page), phone(page)];
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
/** The Layout section as a Grid's: its columns in it (designer, 2026-11-10: one section, titled Layout, a Stack or a Grid). */
const gridSection = (page: Page) => design(page).getByRole("region", { name: "Layout" }).filter({ has: page.getByRole("textbox", { name: "Columns" }) });
/** The Layout section as a Stack's: no columns in it. */
const stackSection = (page: Page) => design(page).getByRole("region", { name: "Layout" }).filter({ hasNot: page.getByRole("textbox", { name: "Columns" }) });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers" });
const field = (page: Page, name: string) => design(page).getByRole("textbox", { name, exact: true });

/** The feature cards' Grid: `grid grid-cols-1 gap-4 sm:grid-cols-3`. */
const GRID = "main > div:has(> article)";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
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
  await page.locator("[data-tk-changes-opener]").click();
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

  const section = gridSection(page);
  await expect(section).toBeVisible();
  await expect(field(page, "Columns")).toHaveValue("3");
  await expect(field(page, "Row gap")).toHaveValue("16");
  await expect(field(page, "Column gap")).toHaveValue("16");
  // A Grid is no Stack: it has no direction or padding of its own.
  await expect(stackSection(page)).toHaveCount(0);

  await setField(page, "Columns", "2");
  await setField(page, "Column gap", "40");
  await expect.poll(() => grids(page)).toEqual(["2 16px 40px", "2 16px 40px", "2 16px 40px"]);
  await expect(field(page, "Columns")).toHaveValue("2");

  // Two cells to a row: the third card starts the second row.
  const [first, third] = [desktop(page).contentFrame().locator("article").nth(0), desktop(page).contentFrame().locator("article").nth(2)];
  // Both read afresh each time: the first card may still be moving too.
  await expect(async () => expect((await third.boundingBox())!.x).toBeCloseTo((await first.boundingBox())!.x, 0)).toPass({ timeout: 5_000 });

  await expect(await changeRows(page)).toReadAs([/Columns.*Grid.*3 → 2/, /Column gap.*Grid.*16px → 40px/]);
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

  // Each marked on its field and reset on its own (designer, 2026-11-07).
  await expect(design(page).getByRole("button", { name: "Reset row gap" })).toBeVisible();
  await design(page).getByRole("button", { name: "Reset columns" }).click();
  await expect(design(page).getByRole("button", { name: "Reset columns" })).toHaveCount(0);
  await expect.poll(() => grids(page)).toEqual(["3 16px 16px", "3 16px 16px", "1 8px 16px"]);
  await expect(field(page, "Columns")).toHaveValue("1");
  await expect(await changeRows(page)).toReadAs([/Row gap.*Grid.*below 768px/]);
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
  await expect(page.locator(".tk-drop-line")).toBeVisible();
  // Only shifted while it moves: Freeze steps into the next cell, the structure is as it was.
  await expect(freeze).not.toHaveCSS("translate", "none");
  await expect.poll(async () => (await cards(page))[0]).toEqual(ORDER);
  await page.mouse.up();

  const moved = ["Your turn", "Freeze", "Arrange", "Apply"];
  await expect.poll(() => cards(page)).toEqual([moved, moved, moved]);
  await expect(page.locator(".tk-drop-line")).toHaveCount(0);
  await expect(freeze).toHaveCSS("translate", "none");
  await expect(await changeRows(page)).toReadAs([/Reorder.*Card.*4th → 1st/]);
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
  await expect(page.locator(".tk-drop-line")).toBeVisible();
  await page.mouse.up();

  const children = () => desktop(page).contentFrame().locator(GRID).evaluate((el) => [...el.children].map((child) => child.querySelector("h3")?.textContent ?? child.localName));
  await expect.poll(children).toEqual(["Freeze", "button", "Arrange", "Apply", "Your turn"]);
  await expect(await changeRows(page)).toReadAs([/Move.*Button.*Stack → Grid/]);
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
  await expect(page.locator(".tk-drop-line")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => cards(page)).toEqual([ORDER, ORDER, ORDER]);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);

  await layers(page).getByRole("treeitem", { name: "Button", exact: true }).click();
  const button = desktop(page).contentFrame().locator('[data-testid="hero"] > button');
  const from = (await button.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 6, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();

  const children = () => desktop(page).contentFrame().locator(GRID).evaluate((el) => [...el.children].map((child) => child.querySelector("h3")?.textContent ?? child.localName));
  await expect.poll(children).toEqual([...ORDER, "button"]);
  await expect(await changeRows(page)).toReadAs([/Move.*Button.*Stack → Grid/]);
});

/** How a view lays the header out: a Grid, by its columns; else its display and direction. */
const headerIn = (view: Locator) =>
  view
    .contentFrame()
    .locator("header")
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return style.display === "grid" ? `grid ${style.gridTemplateColumns.split(" ").length}` : `${style.display} ${style.flexDirection}`;
    });

test("a Stack made a Grid from beside its direction, as in Figma: the Grid section shows, one change, one ⌘Z; and back to a Stack from the Grid section (ticket 109)", async ({ page }) => {
  await enterEditMode(page);
  await layers(page).getByRole("treeitem", { name: "Header", exact: true }).click();
  const stack = stackSection(page);
  const direction = stack.getByRole("radiogroup", { name: "Direction" });
  await expect(direction.getByRole("radio")).toHaveCount(3);
  await expect(direction.getByRole("radio", { name: "Horizontal" })).toHaveAttribute("aria-checked", "true");

  await direction.getByRole("radio", { name: "Grid" }).click();
  // The title and the badge, a column each: a Grid of two, its gap the Stack's.
  await expect.poll(() => Promise.all(views(page).map(headerIn))).toEqual(["grid 2", "grid 2", "grid 2"]);
  const grid = gridSection(page);
  await expect(grid).toBeVisible();
  await expect(stackSection(page)).toHaveCount(0);
  await expect(field(page, "Columns")).toHaveValue("2");
  await expect(field(page, "Column gap")).toHaveValue("12");
  await expect(grid.getByRole("radiogroup", { name: "Direction" }).getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
  // Its columns changed now are of the same change.
  await setField(page, "Columns", "3");
  await expect(await changeRows(page)).toReadAs([/Arrangement.*Header.*horizontal Stack.*→ a Grid of 3 equal columns/]);
  await page.keyboard.press("Escape");

  await grid.getByRole("radiogroup", { name: "Direction" }).getByRole("radio", { name: "Vertical" }).click();
  await expect.poll(() => Promise.all(views(page).map(headerIn))).toEqual(["flex column", "flex column", "flex column"]);
  await expect(stack.getByRole("radiogroup", { name: "Direction" }).getByRole("radio", { name: "Vertical" })).toHaveAttribute("aria-checked", "true");
  await expect(await changeRows(page)).toReadAs([/Arrangement.*Header.*→ a vertical Stack with a gap of 12px/]);
  await page.keyboard.press("Escape");

  // Each a step: back to the Grid of three, then the Stack it was, and no change.
  await page.keyboard.press("Meta+z");
  await expect.poll(() => Promise.all(views(page).map(headerIn))).toEqual(["grid 3", "grid 3", "grid 3"]);
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  await expect.poll(() => Promise.all(views(page).map(headerIn))).toEqual(["flex row", "flex row", "flex row"]);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});

test("in the phone view, the Grid made a vertical Stack at its breakpoint only, marked there and reset there (ticket 109)", async ({ page }) => {
  await enterEditMode(page);
  await pickGrid(page, phone(page));
  const direction = gridSection(page).getByRole("radiogroup", { name: "Direction" });

  await direction.getByRole("radio", { name: "Vertical" }).click();
  const layouts = () => Promise.all(views(page).map((view) => view.contentFrame().locator(GRID).evaluate((el) => `${getComputedStyle(el).display} ${getComputedStyle(el).flexDirection}`)));
  await expect.poll(layouts).toEqual(["grid row", "grid row", "flex column"]);
  const stack = stackSection(page);
  await expect(stack).toBeVisible();
  await expect(await changeRows(page)).toReadAs([/Arrangement.*Grid.*below 768px/]);
  await page.keyboard.press("Escape");

  // Marked on the direction, as made a Stack here; its reset takes it back to the Grid there.
  await stack.getByRole("button", { name: "Reset direction" }).click();
  await expect.poll(layouts).toEqual(["grid row", "grid row", "grid row"]);
  await expect(gridSection(page)).toBeVisible();
});

test("in the phone view, a Grid laying its cards out by areas made a vertical Stack there: the cards in the order of the layers, there alone; ⌘Z and reset take it back (ticket 109's follow-up)", async ({ page }) => {
  // The page lays the cards out by areas, the other way round from their order: the last first.
  await page.locator(GRID).evaluate((el) => {
    Object.assign((el as HTMLElement).style, { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateAreas: '"d c" "b a"' });
    [...el.children].forEach((card, n) => ((card as HTMLElement).style.gridArea = "abcd"[n]));
  });
  await enterEditMode(page);
  /** The cards' titles in each view, as drawn: row by row, left to right. */
  const drawn = () =>
    Promise.all(
      views(page).map((view) =>
        view
          .contentFrame()
          .locator(GRID)
          .evaluate((el) =>
            [...el.children]
              .map((card) => ({ title: card.querySelector("h3")!.textContent, box: card.getBoundingClientRect() }))
              .sort((a, b) => Math.round(a.box.top) - Math.round(b.box.top) || a.box.left - b.box.left)
              .map(({ title }) => title),
          ),
      ),
    );
  const placed = [...ORDER].reverse();
  await expect.poll(drawn).toEqual([placed, placed, placed]);
  await pickGrid(page, phone(page));
  const direction = gridSection(page).getByRole("radiogroup", { name: "Direction" });
  // Offered, though the Grid places its cards itself.
  await expect(direction.getByRole("radio")).toHaveCount(3);

  await direction.getByRole("radio", { name: "Vertical" }).click();
  await expect.poll(drawn).toEqual([placed, placed, ORDER]);
  const stack = stackSection(page);
  await expect(stack).toBeVisible();
  await expect(await changeRows(page)).toReadAs([/Arrangement.*Grid.*below 768px/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Meta+z");
  await expect.poll(drawn).toEqual([placed, placed, placed]);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+z");
  await expect.poll(drawn).toEqual([placed, placed, ORDER]);

  await stack.getByRole("button", { name: "Reset direction" }).click();
  await expect.poll(drawn).toEqual([placed, placed, placed]);
  await expect(gridSection(page)).toBeVisible();
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});

/** A Frame of four absolute boxes, 100 × 40, 24px apart across and 16px down; the fourth `off` px right of its column. */
async function addBoard(page: Page, off = 0) {
  await page.evaluate((off) => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px";
    for (const [id, left, top] of [["one", 20, 30], ["two", 144, 30], ["three", 20, 86], ["four", 144 + off, 86]] as const) {
      const box = Object.assign(document.createElement("div"), { id });
      box.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: 100px; height: 40px; background: #ccc`;
      board.append(box);
    }
    document.querySelector("main")!.append(board);
  }, off);
}

/** Whether what `selector` finds in the desktop view is where it was when this was called, and as large, within 1px. */
async function inPlace(page: Page, selector: string) {
  const boxes = () =>
    desktop(page)
      .contentFrame()
      .locator(selector)
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
  const before = await boxes();
  return async () => {
    const now = await boxes();
    return now.length === before.length && now.every((box, i) => (["x", "y", "width", "height"] as const).every((side) => Math.abs(box[side] - before[i][side]) <= 1));
  };
}

/** Selects the board's boxes, `count` of them, from the first, in the Layers panel. */
async function pickBoxes(page: Page, count: number) {
  const boxRows = layers(page).getByRole("treeitem").filter({ hasText: /^Frame$/ });
  // The last row clicked first, as the ticket 110 test does, so the panel lists the board's boxes; then the first box alone, the others added.
  await layers(page).getByRole("treeitem").last().click();
  await expect(boxRows).toHaveCount(5);
  await boxRows.nth(1).click();
  for (let n = 2; n <= count; n++) await boxRows.nth(n).click({ modifiers: ["Shift"] });
}

test("the multi-select button says what ⇧A makes: Make Grid for free layers in rows and columns, Make Stack for others, said again as its tip shows; made a Grid, its − in the accent takes it back (ticket 110's follow-up)", async ({ page }) => {
  await addBoard(page, 6);
  await enterEditMode(page);
  // Found by their own labels, not their section's name.
  const panel = design(page);
  const tip = page.getByRole("tooltip");

  // Not in a Grid's columns: a Stack, as ⇧A makes it.
  await pickBoxes(page, 4);
  await expect(panel.getByRole("button", { name: "Make Stack" })).toHaveAttribute("data-tk-tip", "Make Stack (⇧A)");

  // The fourth moved into its column meanwhile, the selection the same: its tip, shown, says a Grid.
  await desktop(page).contentFrame().locator("#four").evaluate((el) => void ((el as HTMLElement).style.left = "144px"));
  await panel.getByRole("button", { name: "Make Stack" }).hover();
  await expect(tip).toHaveText("Make Grid (⇧A)");
  const make = panel.getByRole("button", { name: "Make Grid" });
  await expect(make).toHaveAttribute("data-tk-tip", "Make Grid (⇧A)");

  // Two of them, a row: a Stack; all four again: a Grid, as the selection changes.
  await page.mouse.move(0, 0);
  await pickBoxes(page, 2);
  await expect(panel.getByRole("button", { name: "Make Stack" })).toBeVisible();
  await pickBoxes(page, 4);
  await expect(make).toBeVisible();

  const near = await inPlace(page, "#one, #two, #three, #four");
  await make.click();
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true }).last()).toHaveAttribute("aria-selected", "true");
  await expect.poll(near).toBe(true);
  await expect(field(page, "Columns")).toHaveValue("2");

  // Made in this round: its − in the accent, which takes the Grid back out, a change after it too.
  const dissolve = design(page).getByRole("button", { name: "Dissolve Grid" });
  await expect(dissolve).toHaveClass(/\bis-added\b/);
  await setField(page, "Row gap", "30");
  // Its fields unmarked, with no resets, as a Stack made in this round.
  await expect(design(page).locator(".is-changed")).toHaveCount(0);
  await expect(design(page).getByRole("button", { name: /^Reset/ })).toHaveCount(0);
  await dissolve.click();
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true })).toHaveCount(1);
  await expect.poll(near).toBe(true);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});

test("a selection gone back to says what ⇧A makes of it now, not what its tip said before; focused from the keyboard, the button says it again too (review of ticket 110's follow-up)", async ({ page }) => {
  // The fourth box 6px out of its column.
  await addBoard(page, 6);
  await enterEditMode(page);
  const make = (name: string) => design(page).getByRole("button", { name, exact: true });
  const four = desktop(page).contentFrame().locator("#four");
  /** The fourth box put in its column on the canvas itself, the selection left as it is; or, `back`, out of it again. */
  const place = (back = false) =>
    four.evaluate((el, back) => el.style.setProperty("left", back ? "150px" : "144px", "important"), back);
  const left = () => four.evaluate((el) => (el as HTMLElement).offsetLeft);

  // In its column: shown, the tip says a Grid.
  await pickBoxes(page, 4);
  await expect(make("Make Stack")).toBeVisible();
  await place();
  await expect.poll(left).toBe(144);
  await make("Make Stack").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Make Grid (⇧A)");
  await page.mouse.move(0, 0);

  // Out of it again, two of them selected, then all four once more: a Stack, as ⇧A makes it, not the Grid its tip said.
  await place(true);
  await expect.poll(left).toBe(150);
  await pickBoxes(page, 2);
  await pickBoxes(page, 4);
  await expect(make("Make Stack")).toHaveAttribute("data-tk-tip", "Make Stack (⇧A)");

  // In its column again, the selection the same: focused, the button says a Grid.
  await place();
  await expect.poll(left).toBe(144);
  await make("Make Stack").focus();
  await expect(make("Make Grid")).toHaveAttribute("data-tk-tip", "Make Grid (⇧A)");
});

test("a Stack made in this round, made a Grid and its columns changed: its − in the accent takes all of that back, and leaves what was changed of it before and of its layers (review of ticket 110's follow-up)", async ({ page }) => {
  // The fourth box out of its column: the board is made a Stack.
  await addBoard(page, 6);
  await enterEditMode(page);
  const board = desktop(page).contentFrame().locator("#board");
  const four = desktop(page).contentFrame().locator("#four");
  await pickBoxes(page, 1);
  await page.keyboard.press("Escape");
  await setField(page, "Corner radius", "8");
  await expect(board).toHaveCSS("border-top-left-radius", "8px");

  await design(page).getByRole("button", { name: "Make Stack", exact: true }).click();
  await design(page).getByRole("radio", { name: "Grid", exact: true }).click();
  await setField(page, "Columns", "3");
  await expect(board).toHaveCSS("grid-template-columns", /^(\S+ ){2}\S+$/);
  // A layer of it changed since, then the Grid selected again.
  const box = (await four.boundingBox())!;
  await page.keyboard.down("Meta");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Meta");
  await setField(page, "Corner radius", "4");
  await expect(four).toHaveCSS("border-top-left-radius", "4px");
  await layers(page).getByRole("treeitem", { name: "Grid", exact: true }).last().click();
  const dissolve = design(page).getByRole("button", { name: "Dissolve Grid" });
  await expect(dissolve).toHaveClass(/\bis-added\b/);

  await dissolve.click();
  await expect(board).toHaveCSS("display", "block");
  await expect(board).toHaveCSS("grid-template-columns", "none");
  await expect(board).toHaveCSS("border-top-left-radius", "8px");
  await expect(four).toHaveCSS("border-top-left-radius", "4px");
  // Two changes left: the two corner radii.
  await expect(await changeRows(page)).toHaveCount(2);
});

test("a Frame of free boxes in rows and columns, selected alone: its button says Make Grid; made one, its − in the accent takes the Grid back out, a gap changed since too (ticket 110's follow-up)", async ({ page }) => {
  await addBoard(page);
  await enterEditMode(page);
  // A box, then the board around it.
  await pickBoxes(page, 1);
  await page.keyboard.press("Escape");
  await expect(layers(page).getByRole("treeitem").filter({ hasText: /^Frame$/ }).first()).toHaveAttribute("aria-selected", "true");
  const make = design(page).getByRole("button", { name: "Make Grid" });
  await expect(make).toHaveAttribute("data-tk-tip", "Make Grid (⇧A)");
  const near = await inPlace(page, "#board, #one, #two, #three, #four");

  await make.click();
  await expect(field(page, "Columns")).toHaveValue("2");
  await expect.poll(near).toBe(true);
  await setField(page, "Column gap", "40");
  await setField(page, "Row gap", "30");
  const dissolve = design(page).getByRole("button", { name: "Dissolve Grid" });
  await expect(dissolve).toHaveClass(/\bis-added\b/);

  await dissolve.click();
  await expect(field(page, "Columns")).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("#board")).toHaveCSS("display", "block");
  await expect.poll(near).toBe(true);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});

test("a Grid the page has shows Dissolve Grid in its section, as ⌥⇧A: a Frame, its layers in place; one ⌘Z. The cards' Grid, its cards a loop's, has none, as ⌥⇧A does nothing (ticket 110's follow-up)", async ({ page }) => {
  // A Grid of four tiles, two equal columns, 16px down and 24px across.
  await page.evaluate(() => {
    const tiles = Object.assign(document.createElement("div"), { id: "tiles" });
    tiles.style.cssText = "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; width: 224px";
    for (const id of ["one", "two", "three", "four"]) {
      const tile = Object.assign(document.createElement("div"), { id });
      tile.style.cssText = "height: 40px; background: #ccc";
      tiles.append(tile);
    }
    document.querySelector("main")!.append(tiles);
  });
  await enterEditMode(page);
  const gridRows = layers(page).getByRole("treeitem", { name: "Grid", exact: true });
  const columns = field(page, "Columns");
  const dissolve = design(page).getByRole("button", { name: "Dissolve Grid" });

  await expect(gridRows).toHaveCount(2);
  await gridRows.first().click();
  await expect(columns).toBeVisible();
  await expect(dissolve).toHaveCount(0);

  const tiles = desktop(page).contentFrame().locator("#tiles");
  const near = await inPlace(page, "#one, #two, #three, #four");
  await gridRows.last().click();
  await expect(dissolve).toHaveAttribute("data-tk-tip", "Dissolve Grid (⌥⇧A)");
  await expect(dissolve).not.toHaveClass(/\bis-added\b/);

  await dissolve.click();
  await expect(gridRows).toHaveCount(1);
  await expect(columns).toHaveCount(0);
  await expect.poll(near).toBe(true);
  await expect(tiles).toHaveCSS("display", "block");
  await expect(await changeRows(page)).toReadAs([/Dissolve Grid.*Grid → Frame/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Meta+z");
  await expect(gridRows).toHaveCount(2);
  await expect(tiles).toHaveCSS("display", "grid");
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});

test("⇧A on free layers in two rows of two makes a Grid where they are, its columns and gaps theirs; ⌥⇧A dissolves it in place; each one ⌘Z (ticket 110)", async ({ page }) => {
  // A Frame of four absolute boxes, 100 × 40, 24px apart across and 16px down.
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px";
    for (const [id, left, top] of [["one", 20, 30], ["two", 144, 30], ["three", 20, 86], ["four", 144, 86]] as const) {
      const box = Object.assign(document.createElement("div"), { id });
      box.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: 100px; height: 40px; background: #ccc`;
      board.append(box);
    }
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  const boxes = () =>
    desktop(page)
      .contentFrame()
      .locator("#one, #two, #three, #four")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
  const before = await boxes();
  const near = async () => {
    const now = await boxes();
    return now.every((box, i) => (["x", "y", "width", "height"] as const).every((side) => Math.abs(box[side] - before[i][side]) <= 1));
  };
  const boxRows = layers(page).getByRole("treeitem").filter({ hasText: /^Frame$/ });
  await layers(page).getByRole("treeitem").last().click();
  await expect(boxRows).toHaveCount(5);
  await boxRows.nth(1).click();
  for (const n of [2, 3, 4]) await boxRows.nth(n).click({ modifiers: ["Shift"] });

  await page.keyboard.press("Shift+A");

  const made = layers(page).getByRole("treeitem", { name: "Grid", exact: true }).last();
  await expect(made).toHaveAttribute("aria-selected", "true");
  await expect.poll(near).toBe(true);
  await expect(gridSection(page)).toBeVisible();
  await expect(field(page, "Columns")).toHaveValue("2");
  await expect(field(page, "Row gap")).toHaveValue("16");
  await expect(field(page, "Column gap")).toHaveValue("24");
  await expect(await changeRows(page)).toReadAs([/Make Grid.*4 layers, 2 columns, row gap 16px, column gap 24px/]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+Shift+A");
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true })).toHaveCount(1);
  await expect.poll(near).toBe(true);
  await expect(await changeRows(page)).toReadAs([/Make Grid/, /Dissolve Grid.*Grid → Frame/]);
  await page.keyboard.press("Escape");

  // A step each: the Grid back, then the boxes as they were, and no change.
  await page.keyboard.press("Meta+z");
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true })).toHaveCount(2);
  await page.keyboard.press("Meta+z");
  await expect(layers(page).getByRole("treeitem", { name: "Grid", exact: true })).toHaveCount(1);
  await expect.poll(near).toBe(true);
  await expect(page.locator("[data-tk-changes-opener]")).toHaveCount(0);
});
