import { DEV_URL, EXIT_LABEL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Locator, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function layerTree(page: Page) {
  return page.getByRole("tree", { name: "Layers" });
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
}

const HERO = '[data-testid="hero"]';

/** Selects the Get started button, so a press on it drags it rather than the outermost layer. */
async function selectButton(page: Page) {
  await layerTree(page).getByRole("treeitem", { name: "Button", exact: true }).click();
}

/** Where an element is drawn, in page coordinates: the canvas is scaled into the viewport. */
async function boxOf(locator: Locator) {
  return (await locator.boundingBox())!;
}

/** Presses on `from`'s middle and drags to the point `to` returns, in steps, as a hand would. */
async function drag(page: Page, from: Locator, to: () => Promise<{ x: number; y: number }>, { drop = true } = {}) {
  const start = await boxOf(from);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const end = await to();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  if (drop) await page.mouse.up();
}

/** The children of an element on the canvas, by tag. */
function childTags(page: Page, selector: string) {
  return canvas(page)
    .locator(selector)
    .evaluate((el) => [...el.children].map((child) => child.localName));
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("dragged within a Stack, a layer takes another place; the others make room while it moves, with a line where it goes", async ({ page }) => {
  await enterEditMode(page);
  await selectButton(page);
  const button = canvas(page).locator(`${HERO} > button`);
  const paragraph = canvas(page).locator(`${HERO} > p`);

  await drag(page, button, async () => {
    const p = await boxOf(paragraph);
    return { x: p.x + p.width / 2, y: p.y + 2 };
  }, { drop: false });
  // Only shifted while it moves: the paragraph steps down, the structure is as it was.
  await expect(page.locator(".vk-drop-line")).toBeVisible();
  await expect(paragraph).not.toHaveCSS("translate", "none");
  expect(await childTags(page, HERO)).toEqual(["header", "p", "button"]);
  await page.mouse.up();

  expect(await childTags(page, HERO)).toEqual(["header", "button", "p"]);
  await expect(paragraph).toHaveCSS("translate", "none");
  await expect(page.locator(".vk-drop-line")).toHaveCount(0);
  const rows = await layerTree(page).getByRole("treeitem").allTextContents();
  expect(rows.indexOf("Button")).toBeLessThan(rows.indexOf("A Framer-style editor layer for any page."));
  await expect(layerTree(page).getByRole("treeitem", { name: "Button", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  expect(await childTags(page, HERO)).toEqual(["header", "p", "button"]);
});

test("dragged into another Stack, it goes in where it is let go, beside a locked layer rather than into it", async ({ page }) => {
  await enterEditMode(page);
  await selectButton(page);
  const button = canvas(page).locator(`${HERO} > button`);

  // Let go over the Beta badge, which comes from a dependency.
  await drag(page, button, async () => {
    const badge = await boxOf(canvas(page).getByTestId("acme-badge"));
    return { x: badge.x + badge.width / 2 + 1, y: badge.y + badge.height / 2 };
  });

  expect(await childTags(page, "header")).toEqual(["h1", "span", "button"]);
  await expect(canvas(page).getByTestId("acme-badge").locator("button")).toHaveCount(0);
  expect(await childTags(page, HERO)).toEqual(["header", "p"]);
});

test("a locked layer is dragged as a whole", async ({ page }) => {
  await enterEditMode(page);
  await layerTree(page).getByRole("treeitem", { name: "Badge", exact: true }).click();

  await drag(page, canvas(page).getByTestId("acme-badge"), async () => {
    const title = await boxOf(canvas(page).locator("h1"));
    return { x: title.x + 2, y: title.y + title.height / 2 };
  });

  expect(await childTags(page, "header")).toEqual(["span", "h1"]);
});

test("dragged to a Frame's empty space, it is absolute where it is let go, and the Frame is its positioning reference", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0; background: #eee";
    document.querySelector("main")!.append(board);
  });
  await enterEditMode(page);
  await selectButton(page);
  const button = canvas(page).locator(`${HERO} > button`);
  const board = canvas(page).locator("#board");
  const zoom = await page.locator('iframe[title="Canvas"]').evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
  const start = await boxOf(button);
  const target = await boxOf(board);
  // The button's top left goes 40 × 30 canvas px into the board.
  const offset = { x: start.width / 2, y: start.height / 2 };

  await drag(page, button, async () => ({ x: target.x + 40 * zoom + offset.x, y: target.y + 30 * zoom + offset.y }));

  expect(await childTags(page, "#board")).toEqual(["button"]);
  const placed = await canvas(page)
    .locator("#board > button")
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const b = el.parentElement!.getBoundingClientRect();
      return { position: getComputedStyle(el).position, x: r.left - b.left, y: r.top - b.top, reference: getComputedStyle(el.parentElement!).position };
    });
  expect(placed.position).toBe("absolute");
  expect(placed.reference).toBe("relative");
  expect(Math.abs(placed.x - 40)).toBeLessThanOrEqual(2);
  expect(Math.abs(placed.y - 30)).toBeLessThanOrEqual(2);
  // In the layer tree, in the Frame, absolute. (The board was added by hand, outside React: the button reads as App's.)
  const rows = await layerTree(page)
    .getByRole("treeitem")
    .evaluateAll((rows) => rows.map((row) => `${row.getAttribute("aria-level")} ${row.getAttribute("aria-description")}`));
  expect(rows.slice(-4)).toEqual(["3 Frame", "4 Horizontal Stack · Absolute", "5 Text", "5 Image"]);
});

test("Esc while dragging puts everything back", async ({ page }) => {
  await enterEditMode(page);
  await selectButton(page);
  const button = canvas(page).locator(`${HERO} > button`);

  await drag(page, button, async () => {
    const p = await boxOf(canvas(page).locator(`${HERO} > p`));
    return { x: p.x + p.width / 2, y: p.y + 2 };
  }, { drop: false });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  expect(await childTags(page, HERO)).toEqual(["header", "p", "button"]);
  await expect(button).toHaveCSS("translate", "none");
  await expect(page.getByRole("button", { name: /not applied yet/ })).toHaveCount(0);
});

test("a reorder shows on the live page, and is listed as one", async ({ page }) => {
  await enterEditMode(page);
  await selectButton(page);
  await drag(page, canvas(page).locator(`${HERO} > button`), async () => {
    const p = await boxOf(canvas(page).locator(`${HERO} > p`));
    return { x: p.x + p.width / 2, y: p.y + 2 };
  });
  await page.getByRole("button", { name: EXIT_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);

  await expect(page.getByText(/shows? once applied/)).toHaveCount(0);
  // Shown by its order, the page's own markup as it was.
  expect(await page.locator(HERO).evaluate((el) => [...el.children].map((child) => child.localName))).toEqual(["header", "p", "button"]);
  await expect(page.locator(`${HERO} > button`)).toHaveCSS("order", "3");
  await page.getByRole("button", { name: /not applied yet/ }).click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveText([/Reorder.*Button.*3rd → 2nd/]);
});
