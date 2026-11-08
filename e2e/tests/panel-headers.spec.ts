import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

/*
 * The panels' tops, one style for both (designer, 2026-11-08): the Layers' title type, the Design panel's line under
 * the header. Sticky, over what scrolls under them; scrolled, the line runs to the panel's edges.
 */

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/**
 * The line under a panel's header as drawn, in the window: its pseudo-element's box less its clip, and how far it is
 * from the panel's edges (its box less a scrollbar). Also each title's type.
 */
function headerOf(panel: Locator) {
  return panel.evaluate((aside) => {
    const header = aside.querySelector(":scope > .tk-panel-header")!;
    const box = header.getBoundingClientRect();
    const line = getComputedStyle(header, "::after");
    const inset = /inset\(([\d.]+)px(?: ([\d.]+)px)?/.exec(line.clipPath);
    const [y, x] = inset ? [parseFloat(inset[1]), parseFloat(inset[2] ?? inset[1])] : [0, 0];
    const panelBox = aside.getBoundingClientRect();
    const title = getComputedStyle(header.querySelector("h2")!);
    return {
      line: {
        content: line.content,
        height: line.height,
        top: Math.round(box.bottom - parseFloat(line.height) - panelBox.top),
        fromLeft: Math.round(box.left + x - panelBox.left),
        fromRight: Math.round(panelBox.left + aside.clientWidth - (box.right - x)),
        clippedY: y,
      },
      title: { size: title.fontSize, weight: title.fontWeight, color: title.color, after: getComputedStyle(header.querySelector("h2")!, "::after").content },
      headerTop: Math.round(box.top - panelBox.top),
      background: getComputedStyle(header).backgroundColor,
      panelBackground: getComputedStyle(aside).backgroundColor,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await enterEditMode(page);
});

test("both panels' titles in the Layers' type, a line under both headers, level, inset by the panels' padding, and no rule after the Layers' title (designer, 2026-11-08)", async ({ page }) => {
  await expect(layers(page).getByRole("treeitem").first()).toBeVisible();
  const left = await headerOf(layers(page));
  const right = await headerOf(design(page));

  expect(left.title).toEqual({ size: "14px", weight: "500", color: right.title.color, after: "none" });
  expect(right.title).toMatchObject({ size: "14px", weight: "500" });
  for (const { line } of [left, right]) expect(line).toMatchObject({ content: '""', height: "1px", fromLeft: 16, fromRight: 16, clippedY: 0 });
  // Level across the two panels.
  expect(left.line.top).toBe(right.line.top);

  // The Layers' line stays one, shown again.
  await page.getByRole("button", { name: "Hide layers" }).click();
  await page.getByRole("button", { name: "Show layers" }).click();
  await expect(layers(page).getByRole("treeitem").first()).toBeVisible();
  expect((await headerOf(layers(page))).line).toEqual(left.line);
});

test("the Design panel scrolled: its header stays at its top over what scrolls under it, the line from edge to edge; back at the top, inset again (designer, 2026-11-08)", async ({ page }) => {
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "Card", exact: true }).first().click();
  const panel = design(page);
  await expect(panel.getByRole("heading", { name: "Design" })).toBeVisible();
  const atTop = await headerOf(panel);
  expect(atTop.headerTop).toBe(0);
  expect(atTop.background).toBe(atTop.panelBackground);

  const scrolled = await panel.evaluate((aside) => {
    aside.scrollTop = 160;
    return aside.scrollTop;
  });
  expect(scrolled, "the Design panel has room to scroll").toBeGreaterThan(100);

  await expect.poll(async () => (await headerOf(panel)).line).toMatchObject({ fromLeft: 0, fromRight: 0, top: atTop.line.top });
  expect((await headerOf(panel)).headerTop).toBe(0);
  // What scrolled up under the header is there, and hidden: at a point of the header over it, the header is what shows.
  const covered = await panel.evaluate((aside) => {
    const header = aside.querySelector(":scope > .tk-panel-header")!;
    const box = header.getBoundingClientRect();
    const under = [...aside.children].filter((el) => el !== header && el.getBoundingClientRect().top < box.bottom && el.getBoundingClientRect().bottom > box.top);
    const root = aside.getRootNode() as ShadowRoot;
    const x = box.left + box.width / 2;
    const y = box.top + 4;
    const shown = root.elementFromPoint(x, y);
    return { under: under.length, onTop: !!shown && header.contains(shown) };
  });
  expect(covered).toEqual({ under: expect.any(Number), onTop: true });
  expect(covered.under).toBeGreaterThan(0);

  await panel.evaluate((aside) => (aside.scrollTop = 0));
  await expect.poll(async () => (await headerOf(panel)).line).toEqual(atTop.line);
});

test("the button showing the Layers panel, alone over the canvas, is the editor's prominent one: the chosen tool's white and shadow, as large and where the one hiding them is (designer, 2026-11-08)", async ({ page }) => {
  const hide = page.getByRole("button", { name: "Hide layers" });
  const show = page.getByRole("button", { name: "Show layers" });
  const shown = await steadyBox(hide);
  await hide.click();
  const hidden = await steadyBox(show);
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(hidden[key] - shown[key]), key).toBeLessThanOrEqual(0.5);

  await page.mouse.move(700, 400);
  const looks = (el: Element) => ({ background: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow });
  const backing = await page.locator(".tk-tools-backing").evaluate(looks);
  expect(await show.evaluate(looks)).toEqual(backing);
  expect(backing.shadow).not.toBe("none");
  expect(backing.background).toBe("rgb(255, 255, 255)");
});
