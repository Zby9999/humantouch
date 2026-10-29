import { DEV_URL, NEXT_URL, REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

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
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/** A computed style of every card on the canvas, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "paddingTop" | "borderTopLeftRadius" | "boxShadow") {
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
  const swatch = picker.getByRole("option", { name: "brand-500" }).locator(".vk-variable-preview");
  await expect(swatch).toHaveCSS("background-color", "rgb(61, 99, 245)");

  await picker.getByRole("searchbox", { name: "Search variables" }).fill("brand-5");
  await expect(picker.getByRole("option")).toHaveText([/^brand-50#EEF4FF$/, /^brand-500#3D63F5$/]);

  await picker.getByRole("option", { name: "brand-500" }).click();
  await expect(picker).toBeHidden();
  // On the canvas at once, in every instance of the usage.
  expect(await cardStyles(page, "backgroundColor")).toEqual(["rgb(61, 99, 245)", "rgb(61, 99, 245)", "rgb(61, 99, 245)", "rgb(255, 255, 255)"]);
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
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(27, 29, 42)");
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

  expect(await cardStyles(page, "paddingTop")).toEqual(["72px", "72px", "72px", "22px"]);
  const chip = design(page).getByRole("button", { name: "Padding top variable", exact: true });
  await expect(chip).toHaveText("section");
  // The other sides are still values.
  await expect(design(page).getByRole("textbox", { name: "Padding right" })).toHaveValue("22");

  await chip.click();
  await page.getByRole("dialog", { name: "Padding top variables" }).getByRole("option", { name: "4", exact: true }).click();
  await expect(chip).toHaveText("4");
  expect((await cardStyles(page, "paddingTop"))[0]).toBe("16px");

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
  expect((await cardStyles(page, "borderTopLeftRadius"))[0]).toBe("999px");
  await expect(design(page).getByRole("button", { name: "Corner radius variable", exact: true })).toHaveText("pill");

  // Shadows: one Variable for all of them, shown by name in Effects.
  const effects = design(page).getByRole("group", { name: "Effects" });
  await effects.getByRole("button", { name: "Shadow variables" }).click();
  await page.getByRole("dialog", { name: "Shadow variables" }).getByRole("option", { name: "md" }).click();
  expect((await cardStyles(page, "boxShadow"))[0]).toBe("rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px");
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
