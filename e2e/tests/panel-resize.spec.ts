import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Page } from "./fixtures";

// The panels resized by their inner edges, and the Layers scrolled sideways for long names (designer, 2026-11-08).

const layers = (page: Page) => page.getByRole("complementary", { name: "Layers" });
const design = (page: Page) => page.getByRole("complementary", { name: "Design" });
const edge = (page: Page, panel: "Layers" | "Design") => page.getByRole("separator", { name: `Resize the ${panel} panel` });

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

const width = async (page: Page, panel: "Layers" | "Design") => (await (panel === "Layers" ? layers : design)(page).boundingBox())!.width;

/** The middle of a panel's edge, at height `y`. */
async function edgeAt(page: Page, panel: "Layers" | "Design", y = 400) {
  const box = await steadyBox(edge(page, panel));
  return { x: box.x + box.width / 2, y };
}

/** The grip's look: whether it is shown, and its middle's height. */
const grip = (page: Page, panel: "Layers" | "Design") =>
  edge(page, panel)
    .locator(".tk-resizer-grip")
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { opacity: getComputedStyle(el).opacity, middle: Math.round(box.top + box.height / 2) };
    });

/** The edge's line, along the panel's whole height: its color, and how much of it shows. */
const line = (page: Page, panel: "Layers" | "Design") =>
  edge(page, panel).evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { color: style.backgroundColor, opacity: style.opacity, height: style.height };
  });

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
});

test("resting on a panel's edge a moment shows the grip at the pointer; passing over it doesn't", async ({ page }) => {
  await enterEditMode(page);
  const at = await edgeAt(page, "Layers", 300);
  await expect(edge(page, "Layers")).toHaveCSS("cursor", "col-resize");

  await page.mouse.move(at.x, at.y);
  // Not at once: the pointer may only be passing.
  expect((await grip(page, "Layers")).opacity).toBe("0");
  await page.mouse.move(at.x + 200, at.y);
  await page.waitForTimeout(300);
  expect((await grip(page, "Layers")).opacity).toBe("0");

  await page.mouse.move(at.x, at.y);
  await expect.poll(() => grip(page, "Layers")).toEqual({ opacity: "1", middle: 300 });
  // It follows the pointer up and down.
  await page.mouse.move(at.x, 420);
  await expect.poll(async () => (await grip(page, "Layers")).middle).toBe(420);
  // The pointer gone, so is the grip.
  await page.mouse.move(at.x + 200, 420);
  await expect.poll(async () => (await grip(page, "Layers")).opacity).toBe("0");

  // The Design panel's edge the same.
  const right = await edgeAt(page, "Design", 250);
  await page.mouse.move(right.x, right.y);
  await expect.poll(() => grip(page, "Design")).toEqual({ opacity: "1", middle: 250 });
});

test("dragging an edge widens and narrows its panel within its limits, and the canvas takes the rest", async ({ page }) => {
  await enterEditMode(page);
  const viewport = page.getByRole("region", { name: "Canvas viewport" });
  expect(await width(page, "Layers")).toBe(320);
  expect(await width(page, "Design")).toBe(320);

  const left = await edgeAt(page, "Layers");
  await page.mouse.move(left.x, left.y);
  await page.mouse.down();
  await page.mouse.move(left.x + 40, left.y, { steps: 4 });
  await expect.poll(() => width(page, "Layers")).toBe(360);
  await expect.poll(async () => (await viewport.boundingBox())!.x).toBe(360);
  await page.mouse.move(left.x + 400, left.y, { steps: 4 });
  await expect.poll(() => width(page, "Layers")).toBe(400);
  await page.mouse.move(left.x - 400, left.y, { steps: 4 });
  await expect.poll(() => width(page, "Layers")).toBe(200);
  await page.mouse.up();
  await expect(edge(page, "Layers")).toHaveAttribute("aria-valuenow", "200");

  // The Design panel widens leftward, from its default (its least) to 480.
  const right = await edgeAt(page, "Design");
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.mouse.move(right.x - 100, right.y, { steps: 4 });
  await expect.poll(() => width(page, "Design")).toBe(420);
  await page.mouse.move(right.x - 400, right.y, { steps: 4 });
  await expect.poll(() => width(page, "Design")).toBe(480);
  await page.mouse.move(right.x + 200, right.y, { steps: 4 });
  await expect.poll(() => width(page, "Design")).toBe(320);
  await page.mouse.up();
});

test("the canvas keeps 400px between the panels: in a narrower window, a panel goes only so wide", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await enterEditMode(page);
  await expect(edge(page, "Design")).toHaveAttribute("aria-valuemax", "380");
  const right = await edgeAt(page, "Design");
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.mouse.move(right.x - 300, right.y, { steps: 4 });
  await expect.poll(() => width(page, "Design")).toBe(380);
  await page.mouse.up();
  const viewport = (await page.getByRole("region", { name: "Canvas viewport" }).boundingBox())!;
  expect(viewport.width).toBe(400);
});

test("pressed, the grip and the panel's whole edge take the accent; let go, the edge lets it go", async ({ page }) => {
  await enterEditMode(page);
  const at = await edgeAt(page, "Design");
  await page.mouse.move(at.x, at.y);
  expect((await line(page, "Design")).opacity).toBe("0");
  await page.mouse.down();
  await expect(edge(page, "Design")).toHaveClass(/is-pressed/);
  expect(await line(page, "Design")).toEqual({ color: "rgb(0, 143, 240)", opacity: "1", height: "720px" });
  await expect(edge(page, "Design").locator(".tk-resizer-grip")).toHaveCSS("background-color", "rgb(0, 143, 240)");
  await page.mouse.up();
  await expect.poll(async () => (await line(page, "Design")).opacity).toBe("0");
});

test("pressed, the edge's line runs the panel's whole height, over its header, on both panels (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  for (const panel of ["Layers", "Design"] as const) {
    const aside = await (panel === "Layers" ? layers : design)(page).boundingBox();
    const at = await edgeAt(page, panel);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expect(edge(page, panel)).toHaveClass(/is-pressed/);
    const drawn = await edge(page, panel).evaluate((el) => {
      const box = el.getBoundingClientRect();
      const line = getComputedStyle(el, "::before");
      const x = box.left + parseFloat(line.left);
      const root = el.getRootNode() as ShadowRoot;
      // At the panel's very top, by the header, and at its bottom: the edge is what is there.
      return {
        top: Math.round(box.top),
        bottom: Math.round(box.top + parseFloat(line.height)),
        atTop: root.elementFromPoint(x, 0) === el,
        atHeader: root.elementFromPoint(x, 20) === el,
        atBottom: root.elementFromPoint(x, innerHeight - 1) === el,
      };
    });
    expect(drawn).toEqual({ top: Math.round(aside!.y), bottom: Math.round(aside!.y + aside!.height), atTop: true, atHeader: true, atBottom: true });
    await page.mouse.up();
  }
});

test("an edge is there at the headers' height too: the grip shows, and the Design panel's edge drags (designer, 2026-11-08)", async ({ page }) => {
  await enterEditMode(page);
  for (const panel of ["Layers", "Design"] as const) {
    const header = await (panel === "Layers" ? layers : design)(page).locator(".tk-panel-header").boundingBox();
    const y = Math.round(header!.y + header!.height / 2);
    const at = await edgeAt(page, panel, y);
    await page.mouse.move(at.x, at.y);
    await expect.poll(() => grip(page, panel)).toEqual({ opacity: "1", middle: Math.max(y, 24) });
    await page.mouse.move(at.x + (panel === "Layers" ? 200 : -200), at.y);
  }

  const header = await design(page).locator(".tk-panel-header").boundingBox();
  const right = await edgeAt(page, "Design", Math.round(header!.y + header!.height / 2));
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.mouse.move(right.x - 100, right.y, { steps: 4 });
  await expect.poll(() => width(page, "Design")).toBe(420);
  await page.mouse.up();
  await expect(edge(page, "Design")).toHaveAttribute("aria-valuenow", "420");
});

test("a panel's width is kept for the viewer: reloaded, it is as left", async ({ page }) => {
  await enterEditMode(page);
  const at = await edgeAt(page, "Layers");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x - 64, at.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => width(page, "Layers")).toBe(256);

  await page.reload();
  await enterEditMode(page);
  expect(await width(page, "Layers")).toBe(256);
  await expect(edge(page, "Layers")).toHaveAttribute("aria-valuenow", "256");
});

test("focused, an edge moves with the arrow keys: 8px, 32px with Shift", async ({ page }) => {
  await enterEditMode(page);
  const left = edge(page, "Layers");
  await expect(left).toHaveAttribute("aria-valuemin", "200");
  await expect(left).toHaveAttribute("aria-valuemax", "400");
  await left.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(page, "Layers")).toBe(328);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(() => width(page, "Layers")).toBe(296);
  await expect(left).toHaveAttribute("aria-valuenow", "296");
  // Focused from the keyboard, the grip shows, at once.
  expect((await grip(page, "Layers")).opacity).toBe("1");

  // The Design panel's edge moves the same way, which widens it leftward.
  const right = edge(page, "Design");
  await right.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => width(page, "Design")).toBe(328);
  // No narrower than its least.
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => width(page, "Design")).toBe(320);
});

test("a long name shows in full: the Layers scroll sideways, the tree with the names, under their still top (designer, 2026-11-08)", async ({ page }) => {
  const name = "A very long paragraph whose layer name runs well past the Layers panel's edge";
  await page.evaluate((name) => {
    const box = document.createElement("section");
    box.innerHTML = `<div><div><div><p>${name}</p></div></div></div>`;
    document.body.append(box);
  }, name);
  await enterEditMode(page);
  const tree = page.getByRole("tree", { name: "Layers" });
  const row = tree.getByRole("treeitem", { name });
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator(".tk-tree-name")).toHaveText(name);

  const { scroll, client } = await tree.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeGreaterThan(client);
  // Every row as wide as the widest, so hovering one shades it all the way across.
  const rowWidths = await tree.getByRole("treeitem").evaluateAll((rows) => [...new Set(rows.map((row) => (row as HTMLElement).offsetWidth))]);
  expect(rowWidths).toEqual([scroll]);

  /** Where a row's parts are, in the window: its disclosure, its icon, and its name's start and end. */
  const parts = (locator: typeof row) =>
    locator.evaluate((el) => {
      const left = (selector: string) => Math.round(el.querySelector(selector)!.getBoundingClientRect().left);
      const name = el.querySelector(".tk-tree-name")!.getBoundingClientRect();
      return { chevron: left(".tk-tree-chevron"), icon: left(".tk-tree-chevron + *"), start: Math.round(name.left), end: Math.round(name.right) };
    });
  const before = await parts(row);
  const header = layers(page).locator(".tk-panel-header");
  const headerBefore = await header.boundingBox();

  // Sideways over the list, as a trackpad does, far past the end.
  const treeBox = (await tree.boundingBox())!;
  await page.mouse.move(treeBox.x + treeBox.width / 2, treeBox.y + 60);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(200, 0);
  await expect.poll(() => tree.evaluate((el) => el.scrollLeft)).toBe(scroll - client);
  const after = await parts(row);
  // The tree and the name moved as one.
  const moved = after.start - before.start;
  expect(moved).toBeLessThan(0);
  expect({ chevron: after.chevron - before.chevron, icon: after.icon - before.icon }).toEqual({ chevron: moved, icon: moved });
  // The name's end now shows, the panel's padding after it.
  expect(after.end).toBe(Math.round(treeBox.x + client) - 16);
  // The top stays put.
  expect(await header.boundingBox()).toEqual(headerBefore);

  // Hovered, a row is shaded across the panel.
  const box = await steadyBox(row);
  await page.mouse.move(treeBox.x + treeBox.width - 24, box.y + box.height / 2);
  await expect(row).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(Math.round(box.x + box.width)).toBe(Math.round(treeBox.x + client));

  // And back.
  for (let i = 0; i < 8; i++) await page.mouse.wheel(-200, 0);
  await expect.poll(() => parts(row)).toEqual(before);
});

test("a swipe over the Layers goes one way: up and down unless mostly sideways from its start (designer, 2026-11-08)", async ({ page }) => {
  await page.evaluate(() => {
    const many = document.createElement("div");
    many.innerHTML = `<p>A very long paragraph whose layer name runs well past the Layers panel's edge</p>` + Array.from({ length: 40 }, (_, i) => `<p>Row ${i}</p>`).join("");
    document.body.prepend(many);
  });
  await enterEditMode(page);
  const tree = page.getByRole("tree", { name: "Layers" });
  const scrolled = () => tree.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(await tree.evaluate((el) => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight)).toBe(true);
  const box = (await tree.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Down, drifting sideways a little: down only.
  for (let i = 0; i < 8; i++) await page.mouse.wheel(10, 30);
  await expect.poll(async () => (await scrolled()).top).toBeGreaterThan(100);
  expect((await scrolled()).left).toBe(0);

  // A new swipe, as far sideways as down: down only.
  await page.waitForTimeout(400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(12, 10);
  await expect.poll(async () => (await scrolled()).left).toBe(0);
  const before = await scrolled();

  // A new swipe, mostly sideways, drifting down a little: sideways only.
  await page.waitForTimeout(400);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(20, 8);
  await expect.poll(async () => (await scrolled()).left).toBeGreaterThan(100);
  expect((await scrolled()).top).toBe(before.top);
});

test("the Layers still scroll up and down, and a layer selected on the canvas comes into view there", async ({ page }) => {
  await page.evaluate(() => {
    const first = document.createElement("p");
    first.textContent = "Selected from the canvas";
    first.style.cssText = "margin: 0; padding: 24px; font-size: 24px";
    // Many rows after it, for the list to scroll.
    const many = document.createElement("div");
    many.innerHTML = Array.from({ length: 40 }, (_, i) => `<p>Row ${i}</p>`).join("");
    document.body.prepend(first, many);
  });
  await enterEditMode(page);
  const tree = page.getByRole("tree", { name: "Layers" });
  const row = tree.getByRole("treeitem", { name: "Selected from the canvas" });
  expect(await tree.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await tree.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(row).not.toBeInViewport();

  const target = page.locator('iframe[title="Canvas"]').contentFrame().getByText("Selected from the canvas");
  const box = await steadyBox(target);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toBeInViewport();
  // The list scrolled; the panel around it didn't.
  expect(await layers(page).evaluate((el) => el.scrollTop)).toBe(0);
});
