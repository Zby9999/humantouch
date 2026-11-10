import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, test, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

async function selectRow(page: Page, name: string, nth = 0) {
  await layerTree(page).getByRole("treeitem", { name, exact: true }).nth(nth).click();
}

const briefSection = (page: Page) => design(page).getByRole("group", { name: "Brief" });
const briefField = (page: Page) => briefSection(page).getByRole("textbox", { name: "Brief" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const changeList = (page: Page) => page.getByRole("dialog", { name: "Changes" });
/** The marks of layers with a brief, over the views: `view` names one. */
const marks = (page: Page, view?: string) => page.locator(view ? `.tk-brief-mark[data-view="${view}"]` : ".tk-brief-mark");

/** Writes a brief on the layer selected, from the Design panel: typed, then ⌘Enter. */
async function writeBrief(page: Page, text: string) {
  await briefSection(page).getByRole("button", { name: "Add brief" }).click();
  await expect(briefField(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a brief written on a layer from the Design panel marks it on the canvas, in every view and instance, and in the Layers panel, as a change of its own", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await expect(briefField(page)).toHaveCount(0);

  await writeBrief(page, "Bounce back harder when pressed");

  // Set on ⌘Enter, and left: ⌘Z is the canvas's again.
  await expect(briefField(page)).not.toBeFocused();
  await expect(briefField(page)).toHaveValue("Bounce back harder when pressed");
  await expect(canvas(page).locator("article").first()).toHaveAttribute("data-tk-brief", "Bounce back harder when pressed");
  // Three cards of the loop take it, in each of the three views; the fourth card is another usage.
  for (const view of ["Desktop", "Tablet", "Phone"]) await expect(marks(page, view)).toHaveCount(3);
  await expect(layerTree(page).getByRole("treeitem", { name: "Card", exact: true }).first().locator(".tk-tree-brief")).toHaveAttribute(
    "data-tk-tip",
    "Brief: Bounce back harder when pressed",
  );
  await expect(badge(page)).toHaveText("1");
  await badge(page).click();
  await expect(changeList(page).getByRole("listitem")).toReadAs([/Brief.*Card.*“Bounce back harder when pressed”/]);
});

test("a copy of a layer with a brief has none: the brief stays with the layer it was written on", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  await writeBrief(page, "Press in a little");

  await page.keyboard.press("ControlOrMeta+d");

  const buttons = canvas(page).getByRole("button", { name: "Get started" });
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAttribute("data-tk-brief", "Press in a little");
  await expect(buttons.nth(1)).not.toHaveAttribute("data-tk-brief");
  await expect(marks(page, "Desktop")).toHaveCount(1);
  await expect(briefField(page)).toHaveCount(0);
  await expect(briefSection(page).getByRole("button", { name: "Add brief" })).toBeVisible();
});

test("the brief is changed when left, taken off with Remove brief, and each is a step ⌘Z takes back; Esc leaves it as it was", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  await writeBrief(page, "Press in a little");

  await briefField(page).fill("Press in a little, and spring back");
  await briefField(page).press("Escape");
  await expect(briefField(page)).toHaveValue("Press in a little");

  await briefField(page).fill("Press in a little, and spring back");
  await design(page).getByRole("heading", { name: "Brief" }).click();
  await expect(canvas(page).getByRole("button", { name: "Get started" })).toHaveAttribute("data-tk-brief", "Press in a little, and spring back");
  await expect(badge(page)).toHaveText("1");

  await briefSection(page).getByRole("button", { name: "Remove brief" }).click();
  await expect(briefField(page)).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(briefField(page)).toHaveValue("Press in a little, and spring back");
  await expect(marks(page)).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(briefField(page)).toHaveValue("Press in a little");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(briefField(page)).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(briefField(page)).toHaveValue("Press in a little");
});

test("typed, then another layer clicked on the canvas: the brief is set on the layer it was typed for, and what the click selects is selected", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await briefSection(page).getByRole("button", { name: "Add brief" }).click();
  await page.keyboard.type("Bounce back harder when pressed");

  const heading = (await canvas(page).locator("h1").boundingBox())!;
  await page.mouse.click(heading.x + 10, heading.y + heading.height / 2);

  // What a click there selects (the outermost layer under it), not the Card again.
  await expect(layerTree(page).getByRole("treeitem", { selected: true })).toHaveText("Stack");
  await expect(canvas(page).locator("article").first()).toHaveAttribute("data-tk-brief", "Bounce back harder when pressed");
  await expect(badge(page)).toHaveText("1");
});

test("with several layers selected there is no brief to write", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await expect(briefSection(page)).toBeVisible();
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).first().click({ modifiers: ["Shift"] });

  await expect(design(page).getByText("2 layers")).toBeVisible();
  await expect(briefSection(page)).toHaveCount(0);
});

test("taken back one by one from the change list, in edit mode and in preview mode, or all discarded, the brief goes", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await writeBrief(page, "Bounce back harder when pressed");
  await selectRow(page, "Button");
  await writeBrief(page, "Press in a little");
  await expect(badge(page)).toHaveText("2");

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the brief of Card" }).click();
  await expect(marks(page)).toHaveCount(3);
  await expect(canvas(page).locator("article[data-tk-brief]")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // In preview mode: the saved round.
  await page.getByRole("button", { name: "03Kind: back to preview mode" }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the brief of Button" }).click();
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("1");
  await page.keyboard.press("Escape");

  await enterEditMode(page);
  await expect(marks(page)).toHaveCount(3);
  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Discard all" }).click();
  await changeList(page).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await enterEditMode(page);
  await expect(canvas(page).locator("[data-tk-brief]")).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
});
