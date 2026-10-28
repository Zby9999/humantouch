import { expect, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');
const viewportArea = (page: Page) => page.getByRole("region", { name: "Canvas viewport" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
}

/** How many columns the cards are laid out in, in a view. */
function cardColumns(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => {
    const cards = [...frame.contentDocument!.querySelectorAll("article")];
    return new Set(cards.map((card) => card.getBoundingClientRect().left)).size;
  });
}

/** The middle of an element in a view, in page coordinates. */
async function pointOn(view: Locator, selector: string) {
  const box = (await view.contentFrame().locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the selection box is drawn, in page coordinates, one per view. */
function selectionBoxes(page: Page) {
  return page.locator(".vk-selection").evaluateAll((boxes) =>
    boxes.map((box) => {
      const r = box.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

async function boxOf(view: Locator, selector: string) {
  return (await view.contentFrame().locator(selector).first().boundingBox())!;
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("edit mode shows the page as desktop, tablet and phone side by side, each with the CSS breakpoints of its width", async ({ page }) => {
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await enterEditMode(page);

  await expect(desktop(page)).toHaveCSS("width", `${pageWidth}px`);
  await expect(tablet(page)).toHaveCSS("width", "768px");
  await expect(phone(page)).toHaveCSS("width", "390px");
  // Side by side, left to right, all in view.
  const area = (await viewportArea(page).boundingBox())!;
  const boxes = [await desktop(page).boundingBox(), await tablet(page).boundingBox(), await phone(page).boundingBox()].map((b) => b!);
  expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
  expect(boxes[1].x + boxes[1].width).toBeLessThan(boxes[2].x);
  expect(boxes[0].x).toBeGreaterThan(area.x);
  expect(boxes[2].x + boxes[2].width).toBeLessThan(area.x + area.width);

  // `sm:grid-cols-3`: three columns from 640px up, one below.
  expect(await cardColumns(desktop(page))).toBe(3);
  expect(await cardColumns(tablet(page))).toBe(3);
  expect(await cardColumns(phone(page))).toBe(1);
  // `h-screen`: as tall as the window the page was frozen in, in every view.
  const height = await page.evaluate(() => innerHeight);
  for (const view of [desktop(page), tablet(page), phone(page)]) {
    await expect(view.contentFrame().getByTestId("hero")).toHaveCSS("height", `${height}px`);
  }

  // Each view is named, and says it shows only what CSS does at its width.
  for (const name of ["Desktop", "Tablet", "Phone"]) {
    await expect(page.getByRole("group", { name: `${name} view` })).toContainText("CSS responsive only");
  }
});

test("selecting in one view selects the same layer in every view; an edit shows in every view", async ({ page }) => {
  await enterEditMode(page);

  const point = await pointOn(phone(page), "article:last-child h3");
  // ⌘-click: the deepest layer under the pointer.
  await page.keyboard.down("Meta");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Meta");
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { selected: true })).toHaveText("Your turn");

  // One box round the layer in each view.
  await expect.poll(async () => (await selectionBoxes(page)).length).toBe(3);
  const boxes = await selectionBoxes(page);
  const views = [desktop(page), tablet(page), phone(page)];
  for (let i = 0; i < views.length; i++) {
    const at = await boxOf(views[i], "article:last-child h3");
    expect(boxes[i].x).toBeCloseTo(at.x, 0);
    expect(boxes[i].width).toBeCloseTo(at.width, 0);
  }

  const opacity = design(page).getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");
  for (const view of views) {
    await expect(view.contentFrame().locator("article:last-child h3")).toHaveCSS("opacity", "0.5");
  }
});

test("a layer dragged in the phone view goes where it is let go there, and moves in every view", async ({ page }) => {
  await enterEditMode(page);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Button", exact: true }).click();
  const hero = '[data-testid="hero"]';
  const button = phone(page).contentFrame().locator(`${hero} > button`);
  const paragraph = phone(page).contentFrame().locator(`${hero} > p`);

  const start = (await button.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const p = (await paragraph.boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + 1, { steps: 8 });
  // The line where it would go is drawn in the phone view.
  const line = (await page.locator(".vk-drop-line").boundingBox())!;
  expect(line.x).toBeGreaterThanOrEqual(p.x - 1);
  expect(line.x + line.width).toBeLessThanOrEqual(p.x + p.width + 1);
  await page.mouse.up();

  for (const view of [desktop(page), tablet(page), phone(page)]) {
    const order = await view.contentFrame().locator(hero).evaluate((el) => [...el.children].map((child) => child.localName));
    expect(order).toEqual(["header", "button", "p"]);
  }
});

test("a view of another width can be added and the tablet view deleted; the views stay so after a reload; the desktop view stays", async ({ page }) => {
  await enterEditMode(page);

  await page.getByRole("button", { name: "Add view" }).click();
  const width = page.getByRole("spinbutton", { name: "New view width" });
  await width.fill("1024");
  await width.press("Enter");
  const custom = page.locator('iframe[title="Custom 1024"]');
  await expect(custom).toHaveCSS("width", "1024px");
  await expect(custom.contentFrame().locator("h1")).toBeVisible();

  await page.getByRole("button", { name: "Delete Tablet view" }).click();
  await expect(tablet(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Desktop view" })).toHaveCount(0);

  await page.reload();
  await enterEditMode(page);
  await expect(custom).toHaveCSS("width", "1024px");
  await expect(tablet(page)).toHaveCount(0);
  const order = await page.locator("iframe.vk-canvas").evaluateAll((frames) => frames.map((frame) => frame.getAttribute("title")));
  expect(order).toEqual(["Canvas", "Custom 1024", "Phone 390"]);
});

test("a dialog open when the page was frozen is open in every view, laid out at each view's width", async ({ page }) => {
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await enterEditMode(page);

  for (const view of [desktop(page), tablet(page), phone(page)]) {
    const dialog = view.contentFrame().getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Centered across the view, as the page centers it in a window that wide.
    const [left, right, width] = await view.contentFrame().locator("[role=dialog]").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.left, el.ownerDocument.documentElement.clientWidth - r.right, el.ownerDocument.documentElement.clientWidth];
    });
    expect(left).toBeCloseTo(right, 0);
    expect(width).toBe(Number(await view.evaluate((frame: HTMLIFrameElement) => frame.offsetWidth)));
  }
});
