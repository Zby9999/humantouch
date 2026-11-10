import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, steadyBox, expect, test, type Page } from "./fixtures";

const RED = "rgb(255, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function backToPreviewMode(page: Page) {
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of every card, on the canvas in edit mode, on the live page otherwise. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius", where: "canvas" | "page") {
  const cards = where === "canvas" ? canvas(page).locator("article") : page.locator("article");
  return cards.evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const changeList = (page: Page) => page.getByRole("dialog", { name: "Changes" });

/** The change list's surface and title, computed: light as the editor's menus and popovers (designer, 2026-11-08). */
async function expectLightList(page: Page) {
  await expect(changeList(page)).toHaveCSS("background-color", "rgb(245, 245, 245)");
  await expect(changeList(page).getByRole("heading")).toHaveCSS("color", "rgb(10, 10, 9)");
  await expect(changeList(page).getByRole("heading")).toHaveCSS("font-weight", "500");
}

/** The cards of the loop: red, then corner radius 2px. The Get started button: blue. Three changes. */
async function makeThreeChanges(page: Page) {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await selectRow(page, "Button");
  await setField(page, "Fill color", "2563eb");
  await expect(badge(page)).toHaveText("3");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("⌘Z and ⇧⌘Z go back and forth through the edits, across layers, on the canvas and the badge alike", async ({ page }) => {
  await makeThreeChanges(page);
  const button = canvas(page).getByRole("button", { name: "Get started" });
  // Out of the field, as after a click on the canvas.
  await design(page).getByRole("textbox", { name: "Fill color", exact: true }).blur();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(badge(page)).toHaveText("2");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => cardStyles(page, "borderRadius", "canvas")).toEqual(["12px", "12px", "12px", "12px"]);
  // The panel shows the layer the edit is undone on.
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveValue("12");
  await expect(badge(page)).toHaveText("1");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(badge(page)).toHaveText("2");
});

test("a drag on a number's icon is undone as a whole", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  const icon = page.locator('.tk-field:has([aria-label="Corner radius"]) .tk-scrub');
  const { x, y } = await steadyBox(icon);
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + 4 + i * 2, y + 4);
  await page.mouse.up();
  await expect(radius).toHaveValue("17");

  await page.keyboard.press("ControlOrMeta+z");

  await expect(radius).toHaveValue("12");
  await expect(badge(page)).toHaveCount(0);
});

test("while a number's icon is dragged, ⌘Z, ⇧⌘Z, the field's own arrows and Enter, and Tab do nothing; let go, ⌘Z takes the drag back, then the edit before it", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  // Something to undo, the cards red, and something to redo, a corner radius set and undone.
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "2");
  await page.keyboard.press("ControlOrMeta+z");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await expect(radius).toHaveValue("12");
  // The focus stays in the field as its icon is dragged.
  await radius.focus();
  const icon = page.locator('.tk-field:has([aria-label="Corner radius"]) .tk-scrub');
  const { x, y } = await steadyBox(icon);
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(x + 4 + i * 2, y + 4);
  await expect(radius).toHaveValue("15");
  for (const key of ["ControlOrMeta+z", "ControlOrMeta+Shift+z", "ArrowUp", "Enter", "Tab"]) {
    await page.keyboard.press(key);
    await expect(radius, key).toHaveValue("15");
    // Tab would take the focus out of the field, applying what is typed in it.
    await expect(radius, key).toBeFocused();
    await expect.poll(() => cardStyles(page, "backgroundColor", "canvas"), key).toEqual([RED, RED, RED, WHITE]);
    await expect.poll(() => cardStyles(page, "borderRadius", "canvas"), key).toEqual(["15px", "15px", "15px", "12px"]);
    await expect(badge(page), key).toHaveText("2");
  }
  for (let i = 4; i <= 5; i++) await page.mouse.move(x + 4 + i * 2, y + 4);
  await page.mouse.up();
  await expect(radius).toHaveValue("17");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(radius).toHaveValue("12");
  await expect.poll(() => cardStyles(page, "backgroundColor", "canvas")).toEqual([RED, RED, RED, WHITE]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => cardStyles(page, "backgroundColor", "canvas")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await expect(badge(page)).toHaveCount(0);
});

test("while a value is being typed, ⌘Z is the field's own; once applied, ⌘Z undoes the edit though the field keeps focus", async ({ page }) => {
  await makeThreeChanges(page);
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  const button = canvas(page).getByRole("button", { name: "Get started" });

  await hex.fill("00ff00");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await expect(badge(page)).toHaveText("3");

  await hex.press("Escape");
  await hex.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(hex).toHaveValue("DC2626");
});

test("several layers edited together go back together with ⌘Z, the focus still in the field just typed in", async ({ page }) => {
  await enterEditMode(page);
  const css = () =>
    canvas(page)
      .locator('[data-testid="hero"]')
      .evaluate((hero) => {
        const [header, , button] = [...hero.children] as HTMLElement[];
        const of = (el: HTMLElement) => ({ style: el.style.cssText, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height });
        return [of(header), of(button)];
      });
  await selectRow(page, "Header");
  const before = await css();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click({ modifiers: ["Shift"] });
  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();

  await setField(page, "Gap", "30");
  // Distributed evenly: the gap's Auto, which leaves no number to type (designer, 2026-11-07).
  await design(page).getByRole("combobox", { name: "Gap sizing" }).selectOption("auto");
  await setField(page, "Width", "120");
  await expect(badge(page)).toHaveText("6");

  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+z");

  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => css()).toEqual(before);
});

test("in edit mode, an X beside the Design title goes back to preview mode, and the change count beside it opens the change list", async ({ page }) => {
  await makeThreeChanges(page);
  // No toggle floats over the canvas meanwhile.
  await expect(page.locator(".tk-dock")).toHaveCount(0);

  const count = design(page).getByRole("button", { name: "3 changes not applied yet" });
  await expect(count).toHaveText("3");
  await count.click();
  await expect(changeList(page).getByRole("listitem")).toHaveCount(3);
  await expectLightList(page);
  await page.keyboard.press("Escape");
  await expect(changeList(page)).toHaveCount(0);
  await expect(count).toBeFocused();

  await design(page).getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(badge(page)).toHaveText("3");
  // On the toggle too, outside the shell.
  await badge(page).click();
  await expectLightList(page);
});

test("the change list has the keys as soon as it is on the page: Esc pressed before the next frame closes it", async ({ page }) => {
  await makeThreeChanges(page);

  // In the page, so no frame passes between the press on the count and Esc. The key goes where a real one would: to what has focus.
  const closed = await page.evaluate(async () => {
    const root = document.querySelector("third-kind")!.shadowRoot!;
    const settle = () => new Promise((resolve) => setTimeout(resolve));
    root.querySelector<HTMLElement>(".tk-count")!.click();
    await settle();
    if (!root.querySelector('[role="dialog"]')) throw new Error("The change list did not open");
    (root.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    await settle();
    return !root.querySelector('[role="dialog"]');
  });

  expect(closed).toBe(true);
  await expect(design(page).getByRole("button", { name: "3 changes not applied yet" })).toBeFocused();
});

test("the badge opens the change list, where each change can be undone on its own; ⌘Z brings it back", async ({ page }) => {
  await makeThreeChanges(page);

  await badge(page).click();
  const list = changeList(page);
  await expect(list.getByRole("listitem")).toReadAs([/Fill.*Card.*#FFFFFF → #FF0000/, /Corner radius.*Card.*12px → 2px/, /Fill.*Button.*#DC2626 → #2563EB/]);
  await list.getByRole("button", { name: "Undo the corner radius of Card" }).click();

  await expect.poll(() => cardStyles(page, "borderRadius", "canvas")).toEqual(["12px", "12px", "12px", "12px"]);
  await expect.poll(() => cardStyles(page, "backgroundColor", "canvas")).toEqual([RED, RED, RED, WHITE]);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(badge(page)).toHaveText("2");

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(list.getByRole("listitem")).toHaveCount(3);
});

test("a row of the change list names its change on one line, its values in its tip; clicked, its layer is selected and glided to, and the fields it changed blink (designer, 2026-11-10)", async ({ page }) => {
  await makeThreeChanges(page);
  await selectRow(page, "Card");

  await badge(page).click();
  const rows = changeList(page).getByRole("listitem");
  await expect(rows).toHaveText(["Fill · Card", "Corner radius · Card", "Fill · Button"]);
  await expect(rows.first().locator(".tk-change-text")).toHaveAttribute("data-tk-tip", "#FFFFFF → #FF0000");
  // Pointed at, its layer is outlined on the canvas, as pointed at there; and no longer, once the pointer leaves.
  await rows.nth(2).hover();
  await expect(page.locator(".tk-hover")).not.toHaveCount(0);
  await page.getByRole("dialog", { name: "Changes" }).getByRole("heading").hover();
  await expect(page.locator(".tk-hover")).toHaveCount(0);
  await rows.nth(2).getByRole("button", { name: "Fill · Button" }).click();

  await expect(changeList(page)).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true })).toHaveAttribute("aria-selected", "true");
  // In the middle of the viewport, across.
  const viewport = (await page.getByLabel("Canvas viewport").boundingBox())!;
  const off = async () => {
    const box = (await page.locator(".tk-selection:not([data-away])").first().boundingBox())!;
    return Math.abs(box.x + box.width / 2 - (viewport.x + viewport.width / 2));
  };
  await expect.poll(off).toBeLessThanOrEqual(1);
  await expect.poll(() => design(page).locator('[data-tk-mark="fill"]').first().evaluate((el) => getComputedStyle(el).animationName)).toBe("tk-ping");
  // Blinked, as it was.
  await expect(design(page).locator('[data-tk-mark="fill"]').first()).not.toHaveClass(/\btk-ping\b/);
});

test("a shadow added, clicked in the change list, blinks its − in the accent, its fields being unmarked (designer, 2026-11-10)", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  const effects = design(page).getByRole("group", { name: "Effects" });
  await effects.getByRole("button", { name: "Add effect" }).click();
  await page.getByRole("dialog", { name: "Add effect" }).getByRole("option", { name: "Drop shadow", exact: true }).click();
  await selectRow(page, "Card");

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Shadows · Button" }).click();
  // Blinking, not only marked so: a − is a button, whose styles unset all else.
  await expect.poll(() => design(page).getByRole("button", { name: "Remove shadow 1" }).evaluate((el) => getComputedStyle(el).animationName)).toBe("tk-ping");
});

test("in preview mode, a change undone from the list leaves the round at once; the list opens from the keyboard too", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);

  await badge(page).focus();
  await page.keyboard.press("Enter");
  const list = changeList(page);
  await expect(list).toBeVisible();
  await list.getByRole("button", { name: "Undo the fill of Card" }).click();

  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);
  await expect(badge(page)).toHaveText("2");

  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(badge(page)).toBeFocused();

  // The canvas comes back without it.
  await enterEditMode(page);
  await expect.poll(() => cardStyles(page, "backgroundColor", "canvas")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await expect.poll(() => cardStyles(page, "borderRadius", "canvas")).toEqual(["2px", "2px", "2px", "12px"]);
});

test("in preview mode, ⌘Z in the change list undoes what was undone there; with the list closed, ⌘Z is the page's", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await badge(page).click();
  const list = changeList(page);
  await list.getByRole("button", { name: "Undo the fill of Card" }).click();
  await list.getByRole("button", { name: "Undo the fill of Button" }).click();
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("2");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("3");
  await expect(list.getByRole("listitem")).toReadAs([/Fill.*Card/, /Corner radius.*Card/, /Fill.*Button/]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(badge(page)).toHaveText("2");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);

  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("2");
});

test("in the change list, the keys are the editor's: ⌘Z undoes, ⇧⌘Z and Ctrl+Y redo, ⌘Y does neither and is left to the browser", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await badge(page).click();
  const list = changeList(page);
  await list.getByRole("button", { name: "Undo the fill of Card" }).click();
  await list.getByRole("button", { name: "Undo the fill of Button" }).click();
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/]);
  // Whether the last key pressed was taken from the browser (its own action prevented): seen on the window, after the list.
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => ((window as unknown as { taken: boolean }).taken = event.defaultPrevented));
  });
  const takenFromBrowser = () => page.evaluate(() => (window as unknown as { taken: boolean }).taken);

  // ⌘Y: nothing undone (the fill of Button stays out), nothing redone, and the browser has it.
  await page.keyboard.press("Meta+y");
  await expect.poll(() => takenFromBrowser()).toBe(false);
  await page.keyboard.press("Meta+Shift+y");
  await expect.poll(() => takenFromBrowser()).toBe(false);
  await expect(badge(page)).toHaveText("1");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/]);

  await page.keyboard.press("Meta+z");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);
  await expect.poll(() => takenFromBrowser()).toBe(true);
  await page.keyboard.press("Control+z");
  await expect(badge(page)).toHaveText("3");
  await expect.poll(() => takenFromBrowser()).toBe(true);
  // Ctrl+Y and ⇧⌘Z redo: the two undone from the list go again.
  await page.keyboard.press("Control+y");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);
  await expect.poll(() => takenFromBrowser()).toBe(true);
  await page.keyboard.press("Meta+Shift+z");
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/]);
  await expect(badge(page)).toHaveText("1");
  await expect.poll(() => takenFromBrowser()).toBe(true);

  // ⌘Y once more, with a step to redo and one to undo: still nothing.
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+y");
  await expect.poll(() => takenFromBrowser()).toBe(false);
  await expect(list.getByRole("listitem")).toReadAs([/Corner radius.*Card/, /Fill.*Button/]);
  await expect(badge(page)).toHaveText("2");
});

test("the last change undone in preview mode can be brought back with ⌘Z, the list still open", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await setField(page, "Corner radius", "2");
  await backToPreviewMode(page);
  await badge(page).click();

  await changeList(page).getByRole("button", { name: "Undo the corner radius of Card" }).click();
  await expect(badge(page)).toHaveCount(0);
  await expect(changeList(page).getByText("No changes left.")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("1");
  await expect(changeList(page).getByRole("listitem")).toReadAs([/Corner radius.*Card.*12px → 2px/]);
});

test("after a reload there is nothing to undo with ⌘Z, but the change list still undoes each change", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await page.reload();
  await expect(badge(page)).toHaveText("3");

  await enterEditMode(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("3");

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the fill of Button" }).click();
  await expect(canvas(page).getByRole("button", { name: "Get started" })).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(badge(page)).toHaveText("2");
});

test("Discard all asks first; once confirmed, the changes and the canvas are gone, and edit mode freezes the page afresh", async ({ page }) => {
  await makeThreeChanges(page);
  await backToPreviewMode(page);
  await badge(page).click();
  const list = changeList(page);

  await list.getByRole("button", { name: "Discard all" }).click();
  await expect(list.getByText("Discard all 3 changes?")).toBeVisible();
  await list.getByRole("button", { name: "Cancel" }).click();
  await expect(badge(page)).toHaveText("3");

  await list.getByRole("button", { name: "Discard all" }).click();
  await list.getByRole("button", { name: "Discard", exact: true }).click();

  await expect(badge(page)).toHaveCount(0);
  await expect(list).toHaveCount(0);
  await expect.poll(() => cardStyles(page, "backgroundColor", "page")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  // A page state the old canvas was not frozen in.
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  await expect(canvas(page).getByRole("dialog", { name: "Ship it?" })).toBeVisible();
  await expect.poll(() => cardStyles(page, "backgroundColor", "canvas")).toEqual([WHITE, WHITE, WHITE, WHITE]);
});

test("Discard all in edit mode goes back to preview mode, with nothing changed", async ({ page }) => {
  await makeThreeChanges(page);

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Discard all" }).click();
  await changeList(page).getByRole("button", { name: "Discard", exact: true }).click();

  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => cardStyles(page, "backgroundColor", "page")).toEqual([WHITE, WHITE, WHITE, WHITE]);
  await page.waitForTimeout(700); // Past the autosave delay: nothing left to save.
  await page.reload();
  await expect(page.getByRole("button", { name: TOGGLE_LABEL })).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
});
