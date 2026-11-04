import { DEV_URL, NEXT_URL, REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Page } from "./fixtures";

/** Variables on the React 18 + Tailwind v3 example: its config's own, and Tailwind's defaults. */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page, url = REACT18_URL) {
  await page.goto(url);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/**
 * Waits for the project's Variables to be in. They come after the canvas; the
 * panel's fields are then drawn anew, each beside its variable button, and a
 * click in a field before that is lost: what is typed next lands before its
 * value instead of over it. On a busy machine that took more than a second (ticket 93).
 */
async function variablesIn(page: Page) {
  await design(page).locator(".tk-variable-button, .tk-variable-chip").first().waitFor();
}

/** A computed style of every card on the canvas, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "paddingTop" | "paddingRight" | "borderTopLeftRadius" | "boxShadow") {
  return canvas(page)
    .locator("article")
    .evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

test("the color picker's Variables tab lists the project's colors first, by family, with swatches, and finds them by name", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");

  await design(page).getByRole("button", { name: "Fill color picker" }).click();
  const picker = page.getByRole("dialog", { name: "Fill color" });
  // The system's picker is in the Custom tab.
  await expect(picker.getByLabel("Pick fill color")).toBeVisible();
  await picker.getByRole("tab", { name: "Variables" }).click();

  const groups = picker.getByRole("listbox", { name: "Variables" }).getByRole("group");
  await expect(groups.first()).toHaveAccessibleName("This project · brand");
  await expect(groups.nth(1)).toHaveAccessibleName("This project");
  await expect(groups.nth(1).getByRole("option")).toHaveText([/^ink#1B1D2A$/, /^muted#5B6075$/]);
  await expect(picker.getByRole("option", { name: "red-500" })).toBeVisible();
  const swatch = picker.getByRole("option", { name: "brand-500" }).locator(".tk-variable-preview");
  await expect(swatch).toHaveCSS("background-color", "rgb(61, 99, 245)");

  await picker.getByRole("searchbox", { name: "Search variables" }).fill("brand-5");
  await expect(picker.getByRole("option")).toHaveText([/^brand-50#EEF4FF$/, /^brand-500#3D63F5$/]);

  await picker.getByRole("option", { name: "brand-500" }).click();
  await expect(picker).toBeHidden();
  // On the canvas at once, in every instance of the usage.
  await expect.poll(() => cardStyles(page, "backgroundColor")).toEqual(["rgb(61, 99, 245)", "rgb(61, 99, 245)", "rgb(61, 99, 245)", "rgb(255, 255, 255)"]);
  const chip = design(page).getByRole("button", { name: "Fill color variable", exact: true });
  await expect(chip).toHaveText("brand-500");

  // Selected again, it still shows the Variable.
  await selectRow(page, "Card", 3);
  await expect(design(page).getByRole("button", { name: "Fill color variable", exact: true })).toBeHidden();
  await selectRow(page, "Card");
  await expect(chip).toHaveText("brand-500");

  // Another Variable, from the name.
  await chip.click();
  await page.getByRole("dialog", { name: "Fill color" }).getByRole("option", { name: "ink", exact: true }).click();
  await expect(chip).toHaveText("ink");

  // Detached: the color stays, as a value.
  await design(page).getByRole("button", { name: "Detach fill color variable" }).click();
  await expect(chip).toBeHidden();
  await expect(design(page).getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("1B1D2A");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(27, 29, 42)");
});

test("a field's variable button lists its group's Variables; one picked shows by name, to swap or detach, and undoes with the edit", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");

  await design(page).getByRole("button", { name: "Padding top variables" }).click();
  const list = page.getByRole("dialog", { name: "Padding top variables" });
  // Spacing: the project's own first, each with what it comes to.
  await expect(list.getByRole("option").first()).toHaveText(/^gutter22px$/);
  await expect(list.getByRole("option").nth(1)).toHaveText(/^section72px$/);
  await list.getByRole("searchbox", { name: "Search variables" }).fill("sect");
  await expect(list.getByRole("option")).toHaveCount(1);
  await list.getByRole("option", { name: "section" }).click();

  await expect.poll(() => cardStyles(page, "paddingTop")).toEqual(["72px", "72px", "72px", "22px"]);
  const chip = design(page).getByRole("button", { name: "Padding top variable", exact: true });
  await expect(chip).toHaveText("section");
  // The other sides are still values.
  await expect(design(page).getByRole("textbox", { name: "Padding right" })).toHaveValue("22");

  await chip.click();
  await page.getByRole("dialog", { name: "Padding top variables" }).getByRole("option", { name: "4", exact: true }).click();
  await expect(chip).toHaveText("4");
  await expect.poll(async () => (await cardStyles(page, "paddingTop"))[0]).toBe("16px");

  await design(page).getByRole("button", { name: "Detach padding top variable" }).click();
  await expect(design(page).getByRole("textbox", { name: "Padding top" })).toHaveValue("16");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chip).toHaveText("4");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chip).toHaveText("section");

  // Esc closes the list and leaves the field as it is.
  await design(page).getByRole("button", { name: "Corner radius variables" }).click();
  await page.getByRole("dialog", { name: "Corner radius variables" }).press("Escape");
  await expect(page.getByRole("dialog", { name: "Corner radius variables" })).toBeHidden();
});

test("corner radius, shadows, size and font size take Variables of their own groups", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");

  await design(page).getByRole("button", { name: "Corner radius variables" }).click();
  await page.getByRole("dialog", { name: "Corner radius variables" }).getByRole("option", { name: "pill" }).click();
  await expect.poll(async () => (await cardStyles(page, "borderTopLeftRadius"))[0]).toBe("999px");
  await expect(design(page).getByRole("button", { name: "Corner radius variable", exact: true })).toHaveText("pill");

  // Shadows: one Variable for all of them, shown by name in Effects.
  const effects = design(page).getByRole("group", { name: "Effects" });
  await effects.getByRole("button", { name: "Shadow variables" }).click();
  await page.getByRole("dialog", { name: "Shadow variables" }).getByRole("option", { name: "md" }).click();
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px");
  await expect(effects.getByRole("button", { name: "Shadow variable", exact: true })).toHaveText("md");
  await expect(effects.getByRole("group", { name: "Shadow 1" })).toBeHidden();
  await effects.getByRole("button", { name: "Detach shadow variable" }).click();
  await expect(effects.getByRole("group", { name: "Shadow 2" })).toBeVisible();

  await design(page).getByRole("button", { name: "Width variables", exact: true }).click();
  await page.getByRole("dialog", { name: "Width variables" }).getByRole("option", { name: "64", exact: true }).click();
  await expect(canvas(page).locator("article").first()).toHaveCSS("width", "256px");

  await selectRow(page, "Freeze");
  await design(page).getByRole("button", { name: "Font size variables" }).click();
  const sizes = page.getByRole("dialog", { name: "Font size variables" });
  await expect(sizes.getByRole("option").first()).toHaveText(/^display44px$/);
  await sizes.getByRole("option", { name: "lead" }).click();
  await expect(canvas(page).locator("h3").first()).toHaveCSS("font-size", "19px");
  // Line height, letter spacing and stroke weight are in none of the groups.
  await expect(design(page).getByRole("button", { name: "Line height variables" })).toHaveCount(0);
});

test("a Grid's row and column gaps take spacing Variables, each its own", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Grid");
  const grid = canvas(page).locator("[data-testid=features]");

  await design(page).getByRole("button", { name: "Row gap variables" }).click();
  const list = page.getByRole("dialog", { name: "Row gap variables" });
  await expect(list.getByRole("option").first()).toHaveText(/^gutter22px$/);
  await list.getByRole("option", { name: "section" }).click();
  await expect(grid).toHaveCSS("row-gap", "72px");
  await expect(design(page).getByRole("button", { name: "Row gap variable", exact: true })).toHaveText("section");
  // The column gap is still a value, and takes one of its own.
  await expect(design(page).getByRole("textbox", { name: "Column gap" })).toHaveValue("22");
  await design(page).getByRole("button", { name: "Column gap variables" }).click();
  await page.getByRole("dialog", { name: "Column gap variables" }).getByRole("option", { name: "4", exact: true }).click();
  await expect(grid).toHaveCSS("column-gap", "16px");
  await expect(design(page).getByRole("button", { name: "Column gap variable", exact: true })).toHaveText("4");

  await design(page).getByRole("button", { name: "Detach row gap variable" }).click();
  await expect(design(page).getByRole("textbox", { name: "Row gap" })).toHaveValue("72");
});

test("a shadow's color takes a color Variable from the color picker, shown by name, a text layer's too", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  const effects = design(page).getByRole("group", { name: "Effects" });

  await effects.getByRole("button", { name: "Shadow 1 color picker" }).click();
  const picker = page.getByRole("dialog", { name: "Shadow 1 color" });
  await picker.getByRole("tab", { name: "Variables" }).click();
  await picker.getByRole("option", { name: "brand-500" }).click();
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).toMatch(/^rgb\(61, 99, 245\) /);
  const chip = effects.getByRole("button", { name: "Shadow 1 color variable", exact: true });
  await expect(chip).toHaveText("brand-500");
  // Undone with the edit; the shadow keeps its other values.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chip).toBeHidden();
  await expect.poll(async () => (await cardStyles(page, "boxShadow"))[0]).not.toContain("rgb(61, 99, 245)");

  // A text layer's shadow: its color picked by typing part of the name.
  await selectRow(page, "Freeze");
  await effects.getByRole("button", { name: "Add effect" }).click();
  const hex = effects.getByRole("textbox", { name: "Shadow 1 color", exact: true });
  await hex.click();
  await hex.pressSequentially("ink");
  await hex.press("Enter");
  await expect(effects.getByRole("button", { name: "Shadow 1 color variable", exact: true })).toHaveText("ink");
  await expect(canvas(page).locator("h3").first()).toHaveCSS("text-shadow", /^rgb\(27, 29, 42\) /);
});

test("typing part of a name in a field lists its group's Variables that have it, under the field: arrows choose, Enter picks, Esc puts the value back", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await variablesIn(page);
  const matching = page.getByRole("listbox", { name: "Matching variables" });

  // The fill color: the project's brand colors, in its order.
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.click();
  await hex.pressSequentially("BRA");
  await expect(matching.getByRole("option")).toHaveText([/^brand-50#EEF4FF$/, /^brand-100#DBE6FF$/, /^brand-500#3D63F5$/, /^brand-700#2440C4$/]);
  await expect(matching.getByRole("option", { selected: true })).toHaveText(/^brand-50#/);
  await hex.press("ArrowDown");
  await hex.press("ArrowDown");
  await hex.press("ArrowDown");
  await hex.press("ArrowUp");
  await expect(matching.getByRole("option", { selected: true })).toHaveText(/^brand-500#/);
  // Typing goes on: the field keeps the keys.
  await expect(hex).toBeFocused();
  await hex.press("Enter");
  await expect(matching).toBeHidden();
  await expect(design(page).getByRole("button", { name: "Fill color variable", exact: true })).toHaveText("brand-500");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(61, 99, 245)");

  // A spacing field lists spacing Variables only, and a click picks one.
  const top = design(page).getByRole("textbox", { name: "Padding top" });
  await top.click();
  await top.pressSequentially("sec");
  await expect(matching.getByRole("option")).toHaveText([/^section72px$/]);
  await matching.getByRole("option", { name: "section" }).click();
  await expect(design(page).getByRole("button", { name: "Padding top variable", exact: true })).toHaveText("section");
  await expect.poll(async () => (await cardStyles(page, "paddingTop"))[0]).toBe("72px");

  // Esc closes the list and puts back the value; nothing changes.
  const right = design(page).getByRole("textbox", { name: "Padding right" });
  await right.click();
  await right.pressSequentially("gu");
  await expect(matching.getByRole("option")).toHaveText([/^gutter22px$/]);
  await right.press("Escape");
  await expect(matching).toBeHidden();
  await expect(right).toHaveValue("22");
  await expect(design(page).getByRole("button", { name: "Padding right variable", exact: true })).toHaveCount(0);

  // A number lists nothing: it is a value, ↑ steps it.
  await right.fill("2");
  await expect(matching).toBeHidden();
  await right.press("ArrowUp");
  await expect.poll(async () => (await cardStyles(page, "paddingRight"))[0]).toBe("23px");
});

test("a value typed close to a Variable of the field's group shows its name in the field, quietly: a click makes it the Variable, typing on leaves it be", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await variablesIn(page);

  // 71px is 1px from section, 72px.
  const top = design(page).getByRole("textbox", { name: "Padding top" });
  await top.click();
  await top.pressSequentially("71");
  const hint = design(page).getByRole("button", { name: "Use variable section" });
  await expect(hint).toHaveText("section");
  // The field keeps the keys and the value typed.
  await expect(top).toBeFocused();
  await top.press("Enter");
  await expect.poll(async () => (await cardStyles(page, "paddingTop"))[0]).toBe("71px");
  // Still there for the value applied; a click makes it the Variable.
  await hint.click();
  await expect(design(page).getByRole("button", { name: "Padding top variable", exact: true })).toHaveText("section");
  await expect.poll(async () => (await cardStyles(page, "paddingTop"))[0]).toBe("72px");

  // A value that is a Variable, or near none, hints at nothing.
  const right = design(page).getByRole("textbox", { name: "Padding right" });
  await right.click();
  await right.pressSequentially("24");
  await expect(design(page).getByRole("button", { name: /^Use variable/ })).toHaveCount(0);
  // 52px is 4px from Tailwind's 48px and 56px.
  await right.fill("52");
  await expect(design(page).getByRole("button", { name: /^Use variable/ })).toHaveCount(0);
  await right.press("Escape");

  // Only in the field's group: 43px is close to the display font size.
  await selectRow(page, "Freeze");
  const size = design(page).getByRole("textbox", { name: "Font size" });
  const before = await size.inputValue();
  await size.click();
  await size.pressSequentially("43");
  await expect(design(page).getByRole("button", { name: "Use variable display" })).toBeVisible();
  // Esc puts back the value: nothing typed is applied.
  await size.press("Escape");
  await expect(design(page).getByRole("button", { name: /^Use variable/ })).toHaveCount(0);
  await expect(size).toHaveValue(before);

  // A color a hair from brand-500, picked from the hint as it is typed: one edit, undone in one step.
  await selectRow(page, "Card");
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await hex.click();
  await hex.pressSequentially("3E64F4");
  await design(page).getByRole("button", { name: "Use variable brand-500" }).click();
  await expect(design(page).getByRole("button", { name: "Fill color variable", exact: true })).toHaveText("brand-500");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(61, 99, 245)");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("on a Tailwind v4 project, its default theme's Variables are offered; with none, the panel offers values only", async ({ page }) => {
  await enterEditMode(page, DEV_URL);
  await selectRow(page, "Card");
  await design(page).getByRole("button", { name: "Gap variables" }).or(design(page).getByRole("button", { name: "Padding top variables" })).first().click();
  const list = page.getByRole("dialog").filter({ has: page.getByRole("listbox", { name: "Variables" }) });
  await expect(list.getByRole("option", { name: "4", exact: true })).toHaveText(/^416px$/);
  await list.press("Escape");

  // The Next.js example has no Variables: no variable buttons, the color swatch is the system's picker.
  await enterEditMode(page, NEXT_URL);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem").nth(1).click();
  await expect(design(page).getByRole("button", { name: /variables$/ })).toHaveCount(0);
  await expect(design(page).getByRole("button", { name: /color picker$/ })).toHaveCount(0);
});
