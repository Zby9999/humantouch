import { expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const offCanvas = (page: Page) => page.locator('iframe[title="Off canvas"]:visible');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const layerTree = (page: Page) => page.getByRole("tree", { name: "Layers" });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("article").first()).toBeVisible();
}

/** Pans the workspace `dx` px to the right on screen: room opens on the left of the views. */
async function pan(page: Page, dx: number) {
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(-dx, 0);
}

/** Selects the layer by its name in the Layers panel: a press on it then drags it, not the outermost layer around it. */
async function select(page: Page, name: string) {
  await layerTree(page).getByRole("treeitem", { name, exact: true }).first().click();
}

/** Drags from the middle of `from` to a point on the page. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** Where the layer off the canvas is in the workspace, in the desktop view's px from its top left. */
async function placeOff(page: Page) {
  const view = (await desktop(page).boundingBox())!;
  const off = (await offCanvas(page).boundingBox())!;
  const zoom = view.width / (await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.offsetWidth));
  return { x: Math.round((off.x - view.x) / zoom), y: Math.round((off.y - view.y) / zoom) };
}

const LOOK = ["font-family", "font-size", "font-weight", "color", "line-height", "letter-spacing", "width", "height"];
const lookOf = (el: Locator) => el.evaluate((h1, names) => names.map((name) => getComputedStyle(h1).getPropertyValue(name)), LOOK);

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("a layer dragged out of every view goes off the canvas: gone from every view, one deletion, and there beside them as it looked", async ({ page }) => {
  await enterEditMode(page);
  const look = await lookOf(desktop(page).contentFrame().locator("h1"));
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  const title = desktop(page).contentFrame().locator("h1");
  const titleBox = (await title.boundingBox())!;
  await select(page, "Vernier Kit");

  await dragTo(page, title, { x: view.x - 200, y: titleBox.y + titleBox.height / 2 });

  for (const shown of [desktop(page), tablet(page), phone(page)]) await expect(shown.contentFrame().locator("h1")).toBeHidden();
  // Beside the canvas in the layers, by its own name, and selected.
  const first = layerTree(page).getByRole("treeitem").first();
  await expect(first).toHaveText("Vernier Kit");
  await expect(first).toHaveAttribute("aria-level", "1");
  await expect(first).toHaveAttribute("aria-description", /Off canvas/);
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  await badge(page).click();
  await expect(page.getByRole("dialog")).toContainText("Delete");
  await page.keyboard.press("Escape");

  // Off the canvas, left of the views, where it was let go, as it looked: in a document with none of the page's styles.
  await expect(offCanvas(page)).toHaveCount(1);
  const off = (await offCanvas(page).boundingBox())!;
  expect(off.x + off.width).toBeLessThan(view.x);
  const moved = offCanvas(page).contentFrame().locator("h1");
  await expect(moved).toHaveText("Vernier Kit");
  // The page's web font comes along.
  expect(await moved.evaluate(async (h1) => (await h1.ownerDocument.fonts.ready, h1.ownerDocument.fonts.check('700 36px "Space Grotesk"')))).toBe(true);
  expect(await lookOf(moved)).toEqual(look);
  const styles = await moved.evaluate((h1) => [...h1.ownerDocument.querySelectorAll("style")].map((s) => s.textContent).join(""));
  expect(styles).not.toContain(".text-4xl");

});

test("a layer dragged out of the phone view goes from every view; undone, it is back on the canvas and no longer off it", async ({ page }) => {
  await enterEditMode(page);
  await pan(page, -400);
  const view = (await phone(page).boundingBox())!;
  const button = phone(page).contentFrame().getByRole("button", { name: "Get started" });
  await select(page, "Button");

  await dragTo(page, button, { x: view.x + view.width + 200, y: view.y + 200 });

  for (const shown of [desktop(page), tablet(page), phone(page)]) await expect(shown.contentFrame().getByRole("button", { name: "Get started" })).toBeHidden();
  await expect(offCanvas(page).contentFrame().getByRole("button", { name: "Get started" })).toBeVisible();
  // As it looked in the phone view.
  expect((await offCanvas(page).boundingBox())!.x).toBeGreaterThan(view.x + view.width);

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().getByRole("button", { name: "Get started" })).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

test("off the canvas, a layer is edited as any other, with no change for the Agent; it is kept, edits and all, where it was, after a reload", async ({ page }) => {
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  const title = desktop(page).contentFrame().locator("h1");
  await select(page, "Vernier Kit");
  await dragTo(page, title, { x: view.x - 200, y: view.y + 100 });
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  const opacity = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");

  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveCSS("opacity", "0.5");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  // Moved about off the canvas, it goes where it is let go; over a view, it stays where it was.
  const before = await placeOff(page);
  const moved = offCanvas(page).contentFrame().locator("h1");
  const box = (await moved.boundingBox())!;
  await dragTo(page, moved, { x: box.x + box.width / 2 - 30, y: box.y + box.height / 2 + 40 });
  const after = await placeOff(page);
  expect(after.y).toBeGreaterThan(before.y);
  await dragTo(page, moved, { x: view.x + 50, y: view.y + 50 });
  expect(await placeOff(page)).toEqual(after);
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  await page.waitForTimeout(800);
  await page.reload();
  await enterEditMode(page);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveCSS("opacity", "0.5");
  expect(await placeOff(page)).toEqual(after);
  await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

test("a layer off the canvas can be deleted, and comes back with undo; leaving and coming back, it is still gone", async ({ page }) => {
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  await select(page, "Vernier Kit");
  await dragTo(page, desktop(page).contentFrame().locator("h1"), { x: view.x - 200, y: view.y + 100 });
  await expect(offCanvas(page)).toHaveCount(1);

  await page.keyboard.press("Delete");
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(layerTree(page).getByRole("treeitem", { name: "Vernier Kit", exact: true })).toHaveCount(0);
  // Still deleted on the page: only what was set aside went.
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(layerTree(page).getByRole("treeitem").first()).toHaveText("Vernier Kit");
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(offCanvas(page)).toHaveCount(0);

  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await enterEditMode(page);
  await expect(offCanvas(page)).toHaveCount(0);
});

test("taking the deletion back from the change list puts the layer back on the canvas, and so no longer off it, in edit mode and in preview mode", async ({ page }) => {
  const moveTitleOff = async () => {
    await enterEditMode(page);
    await pan(page, 400);
    const view = (await desktop(page).boundingBox())!;
    await select(page, "Vernier Kit");
    await dragTo(page, desktop(page).contentFrame().locator("h1"), { x: view.x - 200, y: view.y + 100 });
    await expect(offCanvas(page)).toHaveCount(1);
  };
  const undoFromList = async () => {
    await badge(page).click();
    await page.getByRole("dialog", { name: "Changes" }).getByRole("button", { name: /^Undo the delet/ }).click();
  };

  await moveTitleOff();
  await undoFromList();
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  // As an edit: ⌘Z moves it off again.
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();

  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await page.getByRole("button", { name: TOGGLE_LABEL }).waitFor();
  await undoFromList();
  await page.keyboard.press("Escape");
  await enterEditMode(page);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
  await expect(offCanvas(page)).toHaveCount(0);
});
