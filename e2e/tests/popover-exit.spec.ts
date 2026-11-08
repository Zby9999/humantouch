import { REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { POPOVER_EXIT_MS } from "../../packages/03kind/src/client/motion";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

/** Popovers opening at once and leaving, closed with the pointer, by fading and moving down; the toolbar's tips (designer, 2026-11-08). */

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function design(page: Page) {
  return page.getByRole("complementary", { name: "Design" });
}

async function enterEditMode(page: Page) {
  await page.goto(REACT18_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** What a menu is just after it closed, read at once, in one go. */
function leavingState(menu: Locator) {
  return menu.evaluateAll((menus) =>
    menus.map((m) => ({
      leaving: m.classList.contains("is-leaving"),
      hidden: m.getAttribute("aria-hidden"),
      inert: (m as HTMLElement).inert,
      pointerEvents: getComputedStyle(m).pointerEvents,
    })),
  );
}

test("a menu closed with the pointer takes no clicks at once and is gone after its exit; with Esc, it is gone at once", async ({ page }) => {
  await enterEditMode(page);
  // Nothing selected: the Design panel lists the Variables, filtered by a select.
  const filter = design(page).getByRole("combobox", { name: "Variables shown" });
  const listbox = page.getByRole("listbox", { name: "Variables shown" });
  const menus = page.locator(".tk-menu");

  // A choice clicked: the menu leaves, out of the accessibility tree and taking no clicks meanwhile.
  await filter.click();
  await expect(listbox).toBeVisible();
  await steadyBox(listbox);
  await listbox.getByRole("option", { name: "Tailwind" }).click();
  const [state] = await leavingState(menus);
  expect(state).toEqual({ leaving: true, hidden: "true", inert: true, pointerEvents: "none" });
  await expect(listbox).toBeHidden();
  await expect(filter).toHaveValue("tailwind");
  // Gone once its exit is over.
  await expect(menus).toHaveCount(0, { timeout: POPOVER_EXIT_MS + 1000 });

  // Esc: gone at once, no exit.
  await filter.click();
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await menus.count()).toBe(0);

  // Enter on a choice: gone at once too.
  await page.keyboard.press("ArrowDown");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  expect(await menus.count()).toBe(0);
  await expect(filter).toHaveValue("all");
});

test("a menu opened again while it leaves is back at once, whole and taking clicks", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const add = design(page).getByRole("group", { name: "Effects" }).getByRole("button", { name: "Add effect" });
  const menu = page.getByRole("dialog", { name: "Add effect" });
  const menus = page.locator(".tk-menu");

  await add.click();
  await expect(menu).toBeVisible();
  // Its button clicked again: it leaves.
  await add.click();
  expect((await leavingState(menus)).map((s) => s.leaving)).toEqual([true]);
  // Clicked once more, during the exit: shown at once, one menu, not leaving.
  await add.click();
  expect(await leavingState(menus)).toEqual([{ leaving: false, hidden: null, inert: false, pointerEvents: "auto" }]);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("opacity", "1");
  await page.waitForTimeout(POPOVER_EXIT_MS + 100);
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: "Drop shadow", exact: true }).click();
  await expect(design(page).getByRole("group", { name: "Effects" }).getByRole("combobox", { name: "Shadow 1 type" })).toBeVisible();

  // A press outside closes it with the exit as well.
  await add.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(10, 10);
  expect((await leavingState(menus)).map((s) => s.leaving)).toEqual([true]);
  await expect(menus).toHaveCount(0, { timeout: POPOVER_EXIT_MS + 1000 });
});

test("the color picker leaves when closed with the pointer, and at once with Esc", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const swatch = design(page).getByRole("button", { name: "Fill color picker" });
  const picker = page.getByRole("dialog", { name: "Fill color" });
  const popovers = page.locator(".tk-popover");

  await swatch.click();
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Close" }).click();
  expect((await leavingState(popovers)).map((s) => s.leaving)).toEqual([true]);
  await expect(picker).toBeHidden();
  await expect(popovers).toHaveCount(0, { timeout: POPOVER_EXIT_MS + 1000 });

  await swatch.click();
  await expect(picker).toBeVisible();
  await picker.press("Escape");
  expect(await popovers.count()).toBe(0);
});

test("a tool pointed at tells its name and key in the dark tip, at the toolbar's left, level with it", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const text = tools.getByRole("button", { name: "Text" });
  // The browser's own tip no more, but the name and key still told.
  await expect(text).not.toHaveAttribute("title");
  await expect(text).toHaveAttribute("aria-keyshortcuts", "T");

  await text.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toHaveText("Text (T)");
  await expect(tip).toHaveCSS("background-color", "rgb(23, 23, 22)");
  const [box, bar, button] = await Promise.all([steadyBox(tip), steadyBox(tools), steadyBox(text)]);
  expect(box.x + box.width).toBeLessThanOrEqual(bar.x);
  expect(Math.abs(box.y + box.height / 2 - (button.y + button.height / 2))).toBeLessThan(1);

  await tools.getByRole("button", { name: "Frame" }).hover();
  await expect(tip).toHaveText("Frame (F)");
  await page.mouse.move(10, 10);
  await expect(tip).toHaveCount(0);
});
