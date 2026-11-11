import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { canvasInPlace, expect, steadyBox, test, type Locator, type Page } from "./fixtures";

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

function phone(page: Page) {
  return page.locator('iframe[title^="Phone"]').contentFrame();
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

const tool = (page: Page, name: string) => page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name, exact: true });
const badge = (page: Page) => page.getByRole("button", { name: /not applied yet/ });
const changeList = (page: Page) => page.getByRole("dialog", { name: "Changes" });
/** The cards of the briefs, beside the views. */
const cards = (page: Page) => page.locator(".ht-brief-card");
const card = (page: Page, layer: string) => page.getByRole("group", { name: `Brief on ${layer}` });
/** Presses a card near its right end: cards sit close beside the views, their middles at times under the Layers panel's edge. */
async function pressCard(page: Page, layer: string) {
  const box = await steadyBox(card(page, layer));
  await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
}
/** The field of the card being written in. */
const field = (page: Page) => page.getByRole("textbox", { name: "Brief" });

/** Clicks just inside the top left of `target` with the Brief tool, picked with B, as it writes on the deepest layer there: its card opens, focused. */
async function openBrief(page: Page, target: Locator) {
  await page.keyboard.press("b");
  await expect(tool(page, "Brief")).toHaveAttribute("aria-pressed", "true");
  const box = await steadyBox(target);
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(field(page)).toBeFocused();
}

/** Writes a brief on `target` with the Brief tool: typed on its card, then Enter. */
async function writeBrief(page: Page, target: Locator, text: string) {
  await openBrief(page, target);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
}

/** Where a card's line ends: at its layer, on screen. */
async function lineEnd(page: Page, nth = 0) {
  return page.locator(".ht-brief-lines circle").nth(nth).evaluate((dot) => {
    const box = dot.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
}

/** How far the canvas is zoomed. */
const zoomOf = (page: Page) => page.locator(".ht-stage").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

/** Zooms the canvas, Control held and the wheel turned in the middle of the window, clear of the panels, till it is between `min` and `max`; then pans the card of `layer` into the middle. */
async function zoomTo(page: Page, layer: string, min: number, max: number) {
  const middle = { x: 720, y: 360 };
  await page.mouse.move(middle.x, middle.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 60; i++) {
    const zoom = await zoomOf(page);
    if (zoom >= min && zoom <= max) break;
    await page.mouse.wheel(0, zoom < min ? -20 : 20);
  }
  await page.keyboard.up("Control");
  const zoom = await zoomOf(page);
  expect(zoom).toBeGreaterThanOrEqual(min);
  expect(zoom).toBeLessThanOrEqual(max);
  const box = await steadyBox(card(page, layer));
  await page.mouse.wheel(box.x + box.width / 2 - middle.x, box.y + box.height / 2 - middle.y);
  await expect.poll(async () => Math.abs((await steadyBox(card(page, layer))).x + box.width / 2 - middle.x)).toBeLessThan(2);
}

/** Zooms in till the cards are full size (ticket 134), the card of `layer` in the middle. */
const zoomInOn = (page: Page, layer: string) => zoomTo(page, layer, 0.6, 1.2);

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.beforeEach(async ({ page }) => {
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
});

test("the Brief tool, fourth in the toolbar and picked with B, writes a brief on the layer clicked: a card left of the desktop view, a dashed line to the middle of the layer's nearest side, a change of its own", async ({ page }) => {
  await enterEditMode(page);
  const tools = page.getByRole("toolbar", { name: "Tools" }).getByRole("button");
  await expect(tools).toHaveText(["", "", "", ""]);
  await expect(tools.nth(3)).toHaveAccessibleName("Brief");
  await expect(tools.nth(3)).toHaveAttribute("aria-keyshortcuts", "B");
  // No Brief in the Design panel any more.
  await selectRow(page, "Card");
  await expect(design(page).getByRole("group", { name: "Brief" })).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);

  await writeBrief(page, canvas(page).locator("article").first(), "Bounce back harder when pressed");

  await expect(canvas(page).locator("article").first()).toHaveAttribute("data-ht-brief", "Bounce back harder when pressed");
  // One card for the brief, though the three cards of the loop take it.
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, "Card")).toContainText("Bounce back harder when pressed");
  const [view, written, layer] = await Promise.all([steadyBox(page.locator('iframe[title="Canvas"]')), steadyBox(card(page, "Card")), steadyBox(canvas(page).locator("article").first())]);
  expect(written.x + written.width).toBeLessThan(view.x);
  const end = await lineEnd(page);
  expect(Math.abs(end.x - layer.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(end.y - (layer.y + layer.height / 2))).toBeLessThanOrEqual(2);
  // The tool stays picked till Esc, or a click in the blank space.
  await expect(tool(page, "Brief")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");

  await expect(layerTree(page).getByRole("treeitem", { name: "Card", exact: true }).first().locator(".ht-tree-brief")).toHaveAttribute(
    "data-ht-tip",
    "Brief: Bounce back harder when pressed",
  );
  await expect(badge(page)).toHaveText("1");
  await badge(page).click();
  await expect(changeList(page).getByRole("listitem")).toReadAs([/Brief.*Card.*“Bounce back harder when pressed”/]);
});

test("a click in the blank space with the Brief tool puts it down; a card opened and left empty writes nothing", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  await openBrief(page, canvas(page).getByRole("button", { name: "Get started" }));
  await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await expect(tool(page, "Brief")).toHaveAttribute("aria-pressed", "true");

  // Under the desktop view: the blank space, clear of the Layers panel's edge.
  const view = await steadyBox(page.locator('iframe[title="Canvas"]'));
  await page.mouse.click(view.x + view.width / 2, view.y + view.height + 40);
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
});

test("changed on its card when left, taken off by leaving it empty, each a step ⌘Z takes back and ⇧⌘Z makes again; Esc leaves it as it was", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  const button = canvas(page).getByRole("button", { name: "Get started" });
  await writeBrief(page, button, "Press in a little");
  await page.keyboard.press("Escape");

  // Clicked, the card is written in; Esc, it is as it was.
  await pressCard(page, "Button");
  await expect(field(page)).toBeFocused();
  await field(page).fill("Press in a little, and spring back");
  await field(page).press("Escape");
  await expect(field(page)).toHaveCount(0);
  await expect(card(page, "Button")).toContainText("Press in a little");
  await expect(button).toHaveAttribute("data-ht-brief", "Press in a little");

  // Left by a click elsewhere: set.
  await pressCard(page, "Button");
  await field(page).fill("Press in a little, and spring back");
  await tool(page, "Select").click();
  await expect(button).toHaveAttribute("data-ht-brief", "Press in a little, and spring back");
  await expect(badge(page)).toHaveText("1");

  // Left empty, by its arrow: taken off (designer, 2026-11-10).
  await pressCard(page, "Button");
  await field(page).fill("");
  await card(page, "Button").getByRole("button", { name: "Set brief" }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(button).not.toHaveAttribute("data-ht-brief");
  await expect(badge(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "Button")).toContainText("Press in a little, and spring back");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "Button")).toHaveText("Press in a little");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cards(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(card(page, "Button")).toContainText("Press in a little");
  await expect(badge(page)).toHaveText("1");
});

test("the Brief tool writes on the deepest layer clicked, as ⌘ held selects it, and points it out so as it is held (designer, 2026-11-10)", async ({ page }) => {
  await enterEditMode(page);
  await page.keyboard.press("b");
  const words = canvas(page).locator("article h3").first();
  const box = await steadyBox(words);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".ht-hover").first()).toBeVisible();
  const outlined = await steadyBox(page.locator('.ht-hover[data-view^="Desktop"]'));
  expect(Math.abs(outlined.height - box.height)).toBeLessThanOrEqual(2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Bolder");
  await page.keyboard.press("Enter");
  await expect(words).toHaveAttribute("data-ht-brief", "Bolder");
  await expect(canvas(page).locator("article").first()).not.toHaveAttribute("data-ht-brief");
});

test("a card is a field with the accent's arrow beside it as it is written in, which sets what is typed, as one edit (designer, 2026-11-10)", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  const button = canvas(page).getByRole("button", { name: "Get started" });
  await writeBrief(page, button, "Press in a little");
  await page.keyboard.press("Escape");
  // Not written in: the brief alone, no arrow.
  await expect(card(page, "Button").getByRole("button")).toHaveCount(0);
  await expect(card(page, "Button")).toHaveText("Press in a little");

  await pressCard(page, "Button");
  await field(page).fill("Something else");
  await card(page, "Button").getByRole("button", { name: "Set brief" }).click();
  await expect(field(page)).toHaveCount(0);
  await expect(button).toHaveAttribute("data-ht-brief", "Something else");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button).toHaveAttribute("data-ht-brief", "Press in a little");
});

test("a Brief press let go off the canvas writes nothing, and puts the tool down; the Select tool's next click selects as ever", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  await page.keyboard.press("b");
  const at = await steadyBox(canvas(page).getByRole("button", { name: "Get started" }));
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(1430, 400, { steps: 4 });
  await page.mouse.up();
  await expect(field(page)).toHaveCount(0);
  await page.keyboard.press("v");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  const heading = await steadyBox(canvas(page).locator("h1"));
  await page.mouse.click(heading.x + 10, heading.y + heading.height / 2);
  // A plain click, from the Button's depth: its sibling there.
  await expect(layerTree(page).getByRole("treeitem", { selected: true })).toHaveText("Header");
  await expect(field(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
});

test("written in the phone view, the card is beside it on the side nearer its layer, and stays there after a reload; a deleted layer's card goes, and comes back with ⌘Z", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/round" && response.request().method() === "PUT");
  await writeBrief(page, phone(page).getByRole("button", { name: "Get started" }), "Press in a little");
  await saved;
  await page.keyboard.press("Escape");
  // The button is at the left of the phone view: its card is left of it, in the gap between it and the tablet view (ticket 134).
  const right = async () => {
    const [view, tablet, written] = await Promise.all([steadyBox(page.locator('iframe[title^="Phone"]')), steadyBox(page.locator('iframe[title^="Tablet"]')), steadyBox(card(page, "Button"))]);
    return written.x + written.width < view.x && written.x > tablet.x + tablet.width;
  };
  await expect.poll(right).toBe(true);

  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await enterEditMode(page);
  await expect(card(page, "Button")).toBeVisible();
  await expect.poll(right).toBe(true);

  await selectRow(page, "Button");
  await page.keyboard.press("Delete");
  await expect(cards(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "Button")).toBeVisible();
  await expect.poll(right).toBe(true);
});

test("cards of layers close together are clear of one another and of the views, in the order of their layers' middles from the top", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Stack");
  await writeBrief(page, canvas(page).locator("h1"), "A larger title");
  await selectRow(page, "Button");
  await writeBrief(page, canvas(page).getByRole("button", { name: "Get started" }), "Press in a little");
  await selectRow(page, "Card");
  await writeBrief(page, canvas(page).locator("article").first(), "Bounce back harder when pressed");
  await page.keyboard.press("Escape");
  await expect(cards(page)).toHaveCount(3);

  const boxes = await Promise.all([0, 1, 2].map((i) => steadyBox(cards(page).nth(i))));
  const views = await Promise.all((await page.locator("iframe.ht-canvas").all()).map((view) => steadyBox(view)));
  for (const a of boxes) {
    for (const b of boxes) if (a !== b) expect(overlap(a, b)).toBe(false);
    for (const view of views) expect(overlap(a, view)).toBe(false);
  }
  const byTop = await Promise.all([0, 1, 2].map(async (i) => ({ y: boxes[i].y, name: await cards(page).nth(i).getAttribute("aria-label") })));
  expect(byTop.sort((a, b) => a.y - b.y).map((c) => c.name)).toEqual(["Brief on Third Kind", "Brief on Button", "Brief on Card"]);
});

test("a copy of a layer with a brief has none: the brief stays with the layer it was written on", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Button");
  await writeBrief(page, canvas(page).getByRole("button", { name: "Get started" }), "Press in a little");
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+d");

  const buttons = canvas(page).getByRole("button", { name: "Get started" });
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAttribute("data-ht-brief", "Press in a little");
  await expect(buttons.nth(1)).not.toHaveAttribute("data-ht-brief");
  await expect(cards(page)).toHaveCount(1);
});

test("typed on a card, then another layer clicked with the Brief tool: the brief is set on the layer it was typed for, and the other's card opens; letters typed are not keys of the canvas", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await openBrief(page, canvas(page).locator("article").first());
  await page.keyboard.type("Bounce back harder when pressed v");
  await expect(field(page)).toHaveValue("Bounce back harder when pressed v");
  await expect(tool(page, "Brief")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");

  const heading = await steadyBox(canvas(page).locator("h1"));
  await page.mouse.click(heading.x + 10, heading.y + heading.height / 2);

  // The deepest layer there (designer, 2026-11-10), its card written in now.
  await expect(layerTree(page).getByRole("treeitem", { selected: true })).toHaveText("Third Kind");
  await expect(card(page, "Third Kind").getByRole("textbox", { name: "Brief" })).toBeFocused();
  await expect(canvas(page).locator("article").first()).toHaveAttribute("data-ht-brief", "Bounce back harder when pressed");
  await expect(badge(page)).toHaveText("1");
});

test("taken back one by one from the change list, in edit mode and in preview mode, or all discarded, the brief and its card go; preview mode shows no card", async ({ page }) => {
  await enterEditMode(page);
  await selectRow(page, "Card");
  await writeBrief(page, canvas(page).locator("article").first(), "Bounce back harder when pressed");
  await selectRow(page, "Button");
  await writeBrief(page, canvas(page).getByRole("button", { name: "Get started" }), "Press in a little");
  await page.keyboard.press("Escape");
  await expect(badge(page)).toHaveText("2");
  await expect(cards(page)).toHaveCount(2);

  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the brief of Card" }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(canvas(page).locator("article[data-ht-brief]")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // In preview mode: the saved round, and no cards.
  await page.getByRole("button", { name: "Human Touch: back to preview mode" }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Undo the brief of Button" }).click();
  await expect(badge(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(badge(page)).toHaveText("1");
  await page.keyboard.press("Escape");

  await enterEditMode(page);
  await expect(cards(page)).toHaveCount(1);
  await badge(page).click();
  await changeList(page).getByRole("button", { name: "Discard all" }).click();
  await changeList(page).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.locator('iframe[title="Canvas"]')).toHaveCount(0);
  await enterEditMode(page);
  await expect(canvas(page).locator("[data-ht-brief]")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
});

test("a new brief is written on a card beside its layer, in its view; set, the card goes out beside the view; changed later, the card opens where it is (designer, 2026-11-10)", async ({ page }) => {
  await enterEditMode(page);
  const button = canvas(page).getByRole("button", { name: "Get started" });
  await openBrief(page, button);
  const [view, layer, writing] = await Promise.all([steadyBox(page.locator('iframe[title="Canvas"]')), steadyBox(button), steadyBox(cards(page).first())]);
  // In the view, right of the layer, level with it.
  expect(writing.x).toBeGreaterThan(layer.x + layer.width);
  expect(writing.x + writing.width).toBeLessThanOrEqual(view.x + view.width);
  expect(Math.abs(writing.y + writing.height / 2 - (layer.y + layer.height / 2))).toBeLessThanOrEqual(2);
  await page.keyboard.type("Press in a little");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  const set = await steadyBox(card(page, "Button"));
  expect(set.x + set.width).toBeLessThan(view.x);

  // Where it is on the canvas, from the desktop view's top left: the canvas may pan to bring it in sight, the card does not move on it.
  await page.keyboard.press("Escape");
  await zoomInOn(page, "Button");
  const onCanvas = async () => {
    const [at, from] = await Promise.all([steadyBox(card(page, "Button")), steadyBox(page.locator('iframe[title="Canvas"]'))]);
    return [Math.round(at.x - from.x), Math.round(at.y - from.y)];
  };
  const before = await onCanvas();
  await pressCard(page, "Button");
  await expect(field(page)).toBeFocused();
  expect(await onCanvas()).toEqual(before);
});

test("a card set before, opened again, grows down where it is, and the cards below it move down to make room (designer, 2026-11-10)", async ({ page }) => {
  await enterEditMode(page);
  // Long enough that the card below it is right under it.
  await writeBrief(page, canvas(page).locator("h1"), "A larger title, ".repeat(40));
  await writeBrief(page, canvas(page).getByRole("button", { name: "Get started" }), "Press in a little");
  await page.keyboard.press("Escape");
  await zoomInOn(page, "Third Kind");
  const [above, below] = await Promise.all([steadyBox(card(page, "Third Kind")), steadyBox(card(page, "Button"))]);
  expect(below.y - (above.y + above.height)).toBeLessThan(above.height / 4);

  await pressCard(page, "Third Kind");
  await expect(field(page)).toBeFocused();
  const [open, moved] = await Promise.all([steadyBox(card(page, "Third Kind")), steadyBox(card(page, "Button"))]);
  expect(open.y).toBeCloseTo(above.y, 0);
  expect(open.height).toBeGreaterThan(above.height);
  expect(overlap(open, moved)).toBe(false);
  expect(moved.y).toBeGreaterThan(below.y);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a card opened again and closed, set or left with Esc, stays where it is: it does not bounce (designer, 2026-11-10)", async ({ page }) => {
    await enterEditMode(page);
    await writeBrief(page, canvas(page).locator("h1"), "A larger title, please, as it reads too small. ".repeat(4));
    await page.keyboard.press("Escape");
    await zoomInOn(page, "Third Kind");
    for (const close of ["Enter", "Escape"]) {
      await pressCard(page, "Third Kind");
      await expect(field(page)).toBeFocused();
      // Where its top is on the screen, each frame, from just before it is closed till it is still.
      const tops = card(page, "Third Kind").evaluate(
        (el) =>
          new Promise<number[]>((done) => {
            const out: number[] = [];
            const t0 = performance.now();
            const tick = () => {
              out.push(el.isConnected ? el.getBoundingClientRect().y : NaN);
              if (performance.now() - t0 < 700) requestAnimationFrame(tick);
              else done(out);
            };
            requestAnimationFrame(tick);
          }),
      );
      await page.waitForTimeout(100);
      await page.keyboard.press(close);
      const seen = (await tops).filter((y) => !Number.isNaN(y));
      for (const y of seen) expect(Math.abs(y - seen[0])).toBeLessThan(1);
    }
  });
});

test.describe("beside every view, the same size at any zoom (ticket 134)", () => {
  /** The live page made long before it is frozen: the cards of the loop far down it, under a tall space. */
  async function longPage(page: Page) {
    await page.evaluate(() => {
      const first = document.querySelector("article")!.parentElement!;
      const space = document.createElement("div");
      space.style.height = "3000px";
      first.before(space);
    });
  }
  const tablet = (page: Page) => page.locator('iframe[title^="Tablet"]').contentFrame();
  /** The gaps between the views, on the screen, in canvas px. */
  async function gaps(page: Page) {
    const zoom = await zoomOf(page);
    const views = await Promise.all((await page.locator("iframe.ht-canvas").all()).map((view) => steadyBox(view)));
    views.sort((a, b) => a.x - b.x);
    return views.slice(1).map((v, i) => Math.round((v.x - (views[i].x + views[i].width)) / zoom));
  }

  test("on a long page, a card of a layer far down the tablet view, between two others, is beside it level with its layer, not above the view; the gaps between the views are wide with a brief, as ever with none, the view written in staying where it is", async ({ page }) => {
    await longPage(page);
    await enterEditMode(page);
    expect(await gaps(page)).toEqual([80, 80]);
    const layer = tablet(page).locator("article").last();
    // Far down the page: the canvas panned to it, the wheel turned in the middle of the window.
    const far = await steadyBox(layer);
    await page.mouse.move(720, 360);
    await page.mouse.wheel(0, far.y + far.height / 2 - 360);
    await expect.poll(async () => Math.abs((await steadyBox(layer)).y + far.height / 2 - 360)).toBeLessThan(2);
    await openBrief(page, layer);
    const viewBefore = await steadyBox(page.locator('iframe[title^="Tablet"]'));
    await page.keyboard.type("Lift on hover");
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect.poll(() => gaps(page)).toEqual([600, 600]);
    const [view, written, at] = await Promise.all([steadyBox(page.locator('iframe[title^="Tablet"]')), steadyBox(cards(page).first()), steadyBox(layer)]);
    // The view written in has not moved on the screen.
    expect(Math.abs(view.x - viewBefore.x)).toBeLessThanOrEqual(1);
    expect(written.x + written.width <= view.x || written.x >= view.x + view.width).toBe(true);
    expect(written.y).toBeGreaterThan(view.y);
    expect(Math.abs(written.y + written.height / 2 - (at.y + at.height / 2))).toBeLessThanOrEqual(2);
    for (const other of await Promise.all((await page.locator("iframe.ht-canvas").all()).map((v) => steadyBox(v)))) expect(overlap(written, other)).toBe(false);

    // The last brief taken off: the gaps as ever.
    await pressCard(page, "Card");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect(cards(page)).toHaveCount(0);
    await expect.poll(() => gaps(page)).toEqual([80, 80]);
  });

  test("a card is 220px wide in 11px type on the screen at any zoom from 50% up; below, it shrinks with the canvas, full size again as it is opened (designer, 2026-11-11)", async ({ page }) => {
    await enterEditMode(page);
    await writeBrief(page, canvas(page).locator("h1"), "A larger title");
    await page.keyboard.press("Escape");
    const size = () =>
      card(page, "Third Kind").evaluate((el) => {
        const text = el.querySelector(".ht-brief-card-text")!;
        return { width: Math.round(el.getBoundingClientRect().width), font: getComputedStyle(text).fontSize, line: Math.round(text.getBoundingClientRect().height) };
      });
    await zoomTo(page, "Third Kind", 0.55, 0.7);
    const zoomedOut = await size();
    await zoomTo(page, "Third Kind", 1.1, 1.6);
    const zoomedIn = await size();
    expect(zoomedOut).toEqual(zoomedIn);
    expect(zoomedIn).toMatchObject({ width: 220, font: "11px" });

    await zoomTo(page, "Third Kind", 0.2, 0.3);
    const zoom = await zoomOf(page);
    expect((await size()).width).toBeCloseTo((220 * zoom) / 0.5, -1);
    await pressCard(page, "Third Kind");
    await expect(field(page)).toBeFocused();
    expect(Math.round((await steadyBox(card(page, "Third Kind"))).width)).toBe(220);
  });
});
