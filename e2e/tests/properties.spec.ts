import { expect, test, type Page } from "@playwright/test";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function selectRow(page: Page, name: string, nth = 0) {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

/** A computed style of every card on the canvas, in page order. */
function cardStyles(page: Page, property: "backgroundColor" | "borderRadius") {
  return canvas(page)
    .locator("article")
    .evaluateAll((cards, property) => cards.map((card) => getComputedStyle(card)[property]), property);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await enterEditMode(page);
});

test("a new fill shows on every instance of the usage, and on no other", async ({ page }) => {
  await selectRow(page, "Card");
  const hex = design(page).getByRole("textbox", { name: "Fill color", exact: true });
  await expect(hex).toHaveValue("FFFFFF");

  await hex.fill("ff0000");
  await hex.press("Enter");

  // Three cards come from one usage in a loop; "Your turn" is another usage.
  expect(await cardStyles(page, "backgroundColor")).toEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 255, 255)"]);
  await expect(hex).toHaveValue("FF0000");
});

test("the color picker paints the canvas while it moves", async ({ page }) => {
  await selectRow(page, "Card", 3);

  await design(page).getByLabel("Pick fill color").fill("#00ff00");

  expect(await cardStyles(page, "backgroundColor")).toEqual([
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(255, 255, 255)",
    "rgb(0, 255, 0)",
  ]);
});

test("fill opacity, and removing and adding a fill", async ({ page }) => {
  await selectRow(page, "Card");
  const fill = design(page).getByRole("group", { name: "Fill" });
  const opacity = fill.getByRole("textbox", { name: "Fill opacity" });
  await expect(opacity).toHaveValue("100%");

  await opacity.fill("50");
  await opacity.press("Enter");
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(255, 255, 255, 0.5)");

  await fill.getByRole("button", { name: "Remove fill" }).click();
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgba(0, 0, 0, 0)");
  await expect(fill.getByRole("textbox")).toHaveCount(0);

  await fill.getByRole("button", { name: "Add fill" }).click();
  expect((await cardStyles(page, "backgroundColor"))[0]).toBe("rgb(255, 255, 255)");
});

test("a uniform corner radius, typed or stepped with the arrow keys", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });
  await expect(radius).toHaveValue("12");

  await radius.fill("4");
  await radius.press("Enter");
  expect(await cardStyles(page, "borderRadius")).toEqual(["4px", "4px", "4px", "12px"]);

  await radius.press("ArrowUp");
  await radius.press("Shift+ArrowUp");
  expect((await cardStyles(page, "borderRadius"))[0]).toBe("15px");
  await expect(radius).toHaveValue("15");
});

test("a value typed and left without Enter still applies to the layer it was typed for", async ({ page }) => {
  await selectRow(page, "Card");
  const radius = design(page).getByRole("textbox", { name: "Corner radius" });

  await radius.fill("2");
  await selectRow(page, "Card", 3);

  expect(await cardStyles(page, "borderRadius")).toEqual(["2px", "2px", "2px", "12px"]);
  await expect(radius).toHaveValue("12");
});

test("a locked layer offers no fill or corner radius", async ({ page }) => {
  await selectRow(page, "Badge");

  await expect(design(page).getByText(/can only be moved and resized as a whole/)).toBeVisible();
  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("a text layer offers no fill or corner radius here", async ({ page }) => {
  await selectRow(page, "Freeze");

  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveCount(0);
});

test("the selection box steps aside while a value changes, so the change can be seen, and comes back after", async ({ page }) => {
  await selectRow(page, "Card");
  const box = page.locator(".vk-selection");
  await expect(box).toBeVisible();

  await design(page).getByRole("textbox", { name: "Corner radius" }).press("ArrowUp");
  await expect(box).toHaveCSS("opacity", "0");

  await expect(box).toHaveCSS("opacity", "1");
});
