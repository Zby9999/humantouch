import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

function rows(page: Page, name: string) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name, exact: true });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

async function setField(page: Page, name: string, value: string) {
  const field = design(page).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** A computed style of the first element matching `selector` on the canvas. */
function canvasStyle(page: Page, selector: string, property: string) {
  return canvas(page)
    .locator(selector)
    .first()
    .evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
}

function widthOf(page: Page, selector: string) {
  return canvas(page)
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
}

const HERO = '[data-testid="hero"]';

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("Fixed, Hug and Fill size a layer on the canvas; Fill is offered only in a Stack", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  const sizing = design(page).getByRole("combobox", { name: "Width sizing" });
  await expect(sizing).toHaveValue("hug");

  await sizing.selectOption("fill");
  expect(await widthOf(page, `${HERO} > button`)).toBe(await widthOf(page, HERO));

  await setField(page, "Width", "200");
  await expect(sizing).toHaveValue("fixed");
  expect(await widthOf(page, `${HERO} > button`)).toBe(200);

  // A card sits in a Grid: no Stack gives it room to fill.
  await rows(page, "Card").first().click();
  await expect(design(page).getByRole("combobox", { name: "Width sizing" }).getByRole("option", { name: "Fill" })).toBeDisabled();
  await expect(design(page).getByRole("textbox", { name: /margin/i })).toHaveCount(0);
});

test("a Stack's direction, gap, padding and alignment, in design language", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Header").click();
  const stack = design(page);
  await expect(stack.getByRole("textbox", { name: "Gap" })).toHaveValue("12");
  await expect(stack.getByRole("radio", { name: "Center left" })).toBeChecked();
  await expect(stack.getByRole("radio", { name: "Horizontal" })).toBeChecked();

  await stack.getByRole("radio", { name: "Bottom right" }).click();
  expect(await canvasStyle(page, "header", "justify-content")).toBe("flex-end");
  expect(await canvasStyle(page, "header", "align-items")).toBe("flex-end");
  await setField(page, "Gap", "24");
  const gap = await canvas(page)
    .locator("header")
    .evaluate((header) => header.children[1].getBoundingClientRect().left - header.children[0].getBoundingClientRect().right);
  expect(gap).toBe(24);
  await setField(page, "Padding left", "10");
  expect(await canvasStyle(page, "header", "padding-left")).toBe("10px");
  await stack.getByRole("radio", { name: "Vertical" }).click();
  expect(await canvasStyle(page, "header", "flex-direction")).toBe("column");
  await stack.getByRole("checkbox", { name: "Distribute evenly" }).check();
  expect(await canvasStyle(page, "header", "justify-content")).toBe("space-between");
});

test("a plain top-to-bottom flow shows as a vertical Stack, and becomes a real one once its gap changes", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  await expect(design(page).getByRole("radio", { name: "Vertical" })).toBeChecked();
  expect(await canvasStyle(page, "article", "display")).toBe("block");

  await setField(page, "Gap", "8");

  expect(await canvasStyle(page, "article", "display")).toBe("flex");
  expect(await canvasStyle(page, "article", "flex-direction")).toBe("column");
  expect(await canvasStyle(page, "article", "row-gap")).toBe("8px");
});

test("opacity, clipping, and a hidden layer that stays in the layer tree and the panel, to be shown again", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();

  await setField(page, "Opacity", "50");
  expect(await canvasStyle(page, "article", "opacity")).toBe("0.5");
  await design(page).getByRole("checkbox", { name: "Clip content" }).check();
  expect(await canvasStyle(page, "article", "overflow")).toBe("hidden");

  await design(page).getByRole("checkbox", { name: "Visible" }).uncheck();
  expect(await canvasStyle(page, "article", "display")).toBe("none");
  await expect(rows(page, "Card")).toHaveCount(4);
  await expect(rows(page, "Card").first()).toHaveAttribute("aria-selected", "true");
  // Hidden, it stays selected and the panel stays as it was, Visible where it was, to be ticked again.
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveValue("50%");
  await expect(design(page).getByRole("combobox", { name: "Width sizing" })).toBeVisible();

  await design(page).getByRole("checkbox", { name: "Visible" }).check();
  expect(await canvasStyle(page, "article", "display")).toBe("block");
});

test("an absolute layer's X and Y are the page's own, even frozen scrolled down", async ({ page }) => {
  await page.evaluate(() => scrollTo(0, 120));
  await page.getByRole("button", { name: "Get started" }).click();
  await enterEditMode(page);
  // The dialog's dimmed backdrop: fixed, at the top of the window.
  await rows(page, "Dialog").first().click();
  await expect(design(page).getByRole("textbox", { name: "Y", exact: true })).toHaveValue("0");

  await setField(page, "Y", "10");
  const top = await canvas(page)
    .locator('[role="dialog"]')
    .evaluate((dialog) => dialog.parentElement!.getBoundingClientRect().top);
  expect(top).toBe(130);
});

test("a locked layer offers its size and nothing else", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Badge").click();

  await expect(design(page).getByText(/can only be moved and resized as a whole/)).toBeVisible();
  await expect(design(page).getByRole("combobox", { name: "Width sizing" })).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveCount(0);
  await expect(design(page).getByRole("textbox", { name: "Min width" })).toHaveCount(0);
  await expect(design(page).getByRole("group", { name: "Fill" })).toHaveCount(0);
});

test("several layers: values they do not share show as Mixed, and one change sets them all, undone together", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  await setField(page, "Corner radius", "4");

  await rows(page, "Card").nth(3).click({ modifiers: ["Shift"] });
  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();
  await expect(design(page).getByRole("textbox", { name: "Corner radius" })).toHaveValue("Mixed");
  await expect(design(page).getByRole("textbox", { name: "Opacity", exact: true })).toHaveValue("100%");

  await setField(page, "Corner radius", "8");
  const radii = () => canvas(page).locator("article").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).borderRadius));
  expect(await radii()).toEqual(["8px", "8px", "8px", "8px"]);

  await design(page).getByRole("textbox", { name: "Corner radius" }).blur();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await radii()).toEqual(["4px", "4px", "4px", "12px"]);
});

test("⇧ + click on the canvas adds a layer to the selection", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  // The canvas takes no pointer input itself: the click goes to where the card is drawn.
  const box = (await canvas(page).locator("article").nth(3).boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.keyboard.up("Shift");

  await expect(design(page).getByRole("heading", { name: "2 layers" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { selected: true })).toHaveCount(2);
});

test("a new size and gap show when the canvas is played at full size", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Button").click();
  await design(page).getByRole("combobox", { name: "Width sizing" }).selectOption("fill");
  await rows(page, "Card").first().click();
  await setField(page, "Gap", "8");
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const button = canvas(page).locator(`${HERO} > button`);
  expect(await button.evaluate((el) => el.getBoundingClientRect().width)).toBe(await canvas(page).locator(HERO).evaluate((el) => el.getBoundingClientRect().width));
  await expect(canvas(page).locator("article").first()).toHaveCSS("display", "flex");
  await expect(canvas(page).locator("article").first()).toHaveCSS("row-gap", "8px");
});

test("minimum and maximum sizes sit in two columns: width on the left, height on the right, minimum above maximum", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  const at = async (name: string) => (await design(page).getByRole("textbox", { name, exact: true }).boundingBox())!;
  const [minW, maxW, minH, maxH] = await Promise.all(["Min width", "Max width", "Min height", "Max height"].map(at));

  expect(maxW.x).toBe(minW.x);
  expect(maxW.y).toBeGreaterThan(minW.y);
  expect(minH.x).toBeGreaterThan(minW.x);
  expect(minH.y).toBe(minW.y);
  expect([maxH.x, maxH.y]).toEqual([minH.x, maxW.y]);
});

test("dragging left and right on the opacity icon changes it, 1% per px", async ({ page }) => {
  await enterEditMode(page);
  await rows(page, "Card").first().click();
  const opacity = design(page).getByRole("textbox", { name: "Opacity", exact: true });
  const icon = page.locator('.tk-field:has([aria-label="Opacity"]) .tk-scrub');
  const { x, y } = (await icon.boundingBox())!;

  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(x + 4 - i, y + 4);
  await page.mouse.up();

  await expect(opacity).toHaveValue("70%");
  expect(await canvasStyle(page, "article", "opacity")).toBe("0.7");
  // It stops at 100%.
  await page.mouse.move(x + 4, y + 4);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(x + 4 + i, y + 4);
  await page.mouse.up();
  await expect(opacity).toHaveValue("100%");
});
