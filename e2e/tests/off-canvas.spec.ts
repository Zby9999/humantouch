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
  await select(page, "03Kind");

  await dragTo(page, title, { x: view.x - 200, y: titleBox.y + titleBox.height / 2 });

  for (const shown of [desktop(page), tablet(page), phone(page)]) await expect(shown.contentFrame().locator("h1")).toBeHidden();
  // Beside the canvas in the layers, by its own name, and selected.
  const first = layerTree(page).getByRole("treeitem").first();
  await expect(first).toHaveText("03Kind");
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
  await expect(moved).toHaveText("03Kind");
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
  await select(page, "03Kind");
  await dragTo(page, title, { x: view.x - 200, y: view.y + 100 });
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  const opacity = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");

  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveCSS("opacity", "0.5");
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  // Moved about off the canvas, it goes where it is let go.
  const before = await placeOff(page);
  const moved = offCanvas(page).contentFrame().locator("h1");
  const box = (await moved.boundingBox())!;
  await dragTo(page, moved, { x: box.x + box.width / 2 - 30, y: box.y + box.height / 2 + 40 });
  const after = await placeOff(page);
  expect(after.y).toBeGreaterThan(before.y);
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
  await select(page, "03Kind");
  await dragTo(page, desktop(page).contentFrame().locator("h1"), { x: view.x - 200, y: view.y + 100 });
  await expect(offCanvas(page)).toHaveCount(1);

  await page.keyboard.press("Delete");
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(layerTree(page).getByRole("treeitem", { name: "03Kind", exact: true })).toHaveCount(0);
  // Still deleted on the page: only the off-canvas layer went.
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(layerTree(page).getByRole("treeitem").first()).toHaveText("03Kind");
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
    await select(page, "03Kind");
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

test("while a layer off the canvas is dragged, Delete, ⌘D and the arrows do nothing; let go, it is where it was let go, with no style of the drag left on it", async ({ page }) => {
  await moveTitleOff(page);
  const off = (await offCanvas(page).boundingBox())!;
  const moved = offCanvas(page).contentFrame().locator("body > *").first();
  const box = (await moved.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 3 - 80, box.y + 3 + 60, { steps: 10 });
  for (const key of ["Delete", "Backspace", `${mod}+d`, "ArrowRight", `${mod}+x`, "Shift+A", `${mod}+Shift+g`]) {
    await page.keyboard.press(key);
    await expect(offCanvas(page), key).toHaveCount(1);
    await expect(desktop(page).contentFrame().locator("h1"), key).toBeHidden();
    await expect(badge(page), key).toHaveAccessibleName("1 change not applied yet");
  }
  await page.mouse.up();

  await expect(offCanvas(page)).toHaveCount(1);
  expect((await offCanvas(page).boundingBox())!.x).toBeLessThan(off.x - 40);
  expect(await moved.evaluate((el) => (el as HTMLElement).style.cssText)).toBe("");
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
});

/** Moves the title off the canvas, to the left of the views, as the designer drags it out of the desktop view. */
async function moveTitleOff(page: Page) {
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  await select(page, "03Kind");
  await dragTo(page, desktop(page).contentFrame().locator("h1"), { x: view.x - 200, y: view.y + 100 });
  await expect(offCanvas(page)).toHaveCount(1);
}

/** Drags the layer off the canvas by a point just inside its top left, which is let go at `to` on the page: where it goes is where the pointer is. */
async function dragOffTo(page: Page, to: { x: number; y: number }) {
  const moved = offCanvas(page).contentFrame().locator("body > *").first();
  const box = (await moved.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(to.x + 3, to.y + 3, { steps: 10 });
  await page.mouse.up();
}

/** Zooms the workspace out, about the middle of the viewport. */
async function zoomOut(page: Page) {
  const area = (await viewportArea(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
}

/** The changes not applied yet, as the change list names them. */
async function changeNames(page: Page) {
  await badge(page).click();
  const names = await page.getByRole("dialog", { name: "Changes" }).locator(".tk-change-name").allTextContents();
  await page.keyboard.press("Escape");
  return names;
}

test("dragged back where it was in the same round, a layer off the canvas is in every view again, and neither change is left; undone, it is off the canvas again", async ({ page }) => {
  await moveTitleOff(page);
  const beta = (await desktop(page).contentFrame().locator("header").getByText("Beta").boundingBox())!;

  // Let go at the start of its Stack, where it was: the badge took its place meanwhile.
  await dragOffTo(page, { x: beta.x, y: beta.y + beta.height / 2 - 3 });

  await expect(offCanvas(page)).toHaveCount(0);
  for (const shown of [desktop(page), tablet(page), phone(page)]) {
    await expect(shown.contentFrame().locator("header > h1")).toBeVisible();
    expect(await shown.contentFrame().locator("header > *").first().evaluate((el) => el.localName)).toBe("h1");
  }
  await expect(badge(page)).toHaveCount(0);
  await expect(layerTree(page).getByRole("treeitem").first()).not.toHaveAttribute("aria-description", /Off canvas/);

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

test("while a layer off the canvas is dragged, ⌘Z and ⇧⌘Z do nothing; Esc leaves it where it was, and let go elsewhere, one ⌘Z takes it back there", async ({ page }) => {
  await moveTitleOff(page);
  // Something to redo: the Get started button deleted, and that undone.
  const getStarted = desktop(page).contentFrame().getByRole("button", { name: "Get started" });
  await select(page, "Button");
  await page.keyboard.press("Delete");
  await expect(getStarted).toBeHidden();
  await page.keyboard.press(`${mod}+z`);
  await expect(getStarted).toBeVisible();
  const was = await placeOff(page);
  const off = (await offCanvas(page).boundingBox())!;
  const moved = offCanvas(page).contentFrame().locator("body > *").first();
  const grab = async () => {
    const box = (await moved.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.mouse.move(box.x + 3 - 80, box.y + 3 + 60, { steps: 10 });
  };

  await grab();
  for (const key of [`${mod}+z`, `${mod}+Shift+z`]) {
    await page.keyboard.press(key);
    // Still off the canvas: the move off it is not undone, nor the deletion redone.
    await expect(offCanvas(page)).toHaveCount(1);
    await expect(desktop(page).contentFrame().locator("h1")).toBeHidden();
    await expect(getStarted).toBeVisible();
    await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
  }
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await placeOff(page)).toEqual(was);
  expect(await moved.evaluate((el) => (el as HTMLElement).style.cssText)).toBe("");

  await grab();
  await page.keyboard.press(`${mod}+z`);
  await page.mouse.up();
  expect((await offCanvas(page).boundingBox())!.x).toBeLessThan(off.x - 40);
  await page.keyboard.press(`${mod}+z`);
  // Back where it was, still off the canvas; once more, back on it.
  expect(await placeOff(page)).toEqual(was);
  await expect(offCanvas(page)).toHaveCount(1);
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("h1")).toBeVisible();
});

test("while a layer inside a layer off the canvas is dragged, ⌘Z and ⇧⌘Z do nothing; Esc leaves it where it was, and let go elsewhere in it, one ⌘Z takes it back there", async ({ page }) => {
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  // The header off the canvas, the title and the Beta badge in it, by the gap between them.
  await select(page, "03Kind");
  await page.keyboard.press("Escape");
  const title = (await desktop(page).contentFrame().locator("header > h1").boundingBox())!;
  const gap = { x: title.x + title.width + 4, y: title.y + title.height / 2 };
  await page.mouse.move(gap.x, gap.y);
  await page.mouse.down();
  await page.mouse.move(view.x - 300, view.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect(offCanvas(page)).toHaveCount(1);
  const header = offCanvas(page).contentFrame().locator("header");
  await expect(header.locator("h1")).toBeVisible();
  // Something to redo: the Get started button deleted, and that undone.
  const getStarted = desktop(page).contentFrame().getByRole("button", { name: "Get started" });
  await select(page, "Button");
  await page.keyboard.press("Delete");
  await expect(getStarted).toBeHidden();
  await page.keyboard.press(`${mod}+z`);
  await expect(getStarted).toBeVisible();
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");

  const order = () => header.locator("> *").evaluateAll((els) => els.map((el) => el.textContent));
  const beta = header.getByText("Beta");
  const styleOfBeta = () => beta.evaluate((el) => (el as HTMLElement).style.cssText);
  const before = await styleOfBeta();
  // Selected first, the deepest layer under the pointer, so a press on it then drags it rather than the header.
  await beta.click({ modifiers: [mod] });
  const grab = async () => {
    const from = (await beta.boundingBox())!;
    const to = (await header.locator("h1").boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 10 });
  };

  await grab();
  for (const key of [`${mod}+z`, `${mod}+Shift+z`]) {
    await page.keyboard.press(key);
    // Still off the canvas as it was: the move off it is not undone, nor the deletion redone.
    await expect(offCanvas(page), key).toHaveCount(1);
    expect(await order(), key).toEqual(["03Kind", "Beta"]);
    await expect(desktop(page).contentFrame().locator("header"), key).toBeHidden();
    await expect(getStarted, key).toBeVisible();
    await expect(badge(page), key).toHaveAccessibleName("1 change not applied yet");
  }
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await order()).toEqual(["03Kind", "Beta"]);
  // No style of the drag left on it.
  expect(await styleOfBeta()).toBe(before);

  await grab();
  await page.keyboard.press(`${mod}+z`);
  await page.mouse.up();
  await expect.poll(order).toEqual(["Beta", "03Kind"]);
  await page.keyboard.press(`${mod}+z`);
  // Back where it was in the layer off the canvas; once more, the header is back on the canvas.
  await expect.poll(order).toEqual(["03Kind", "Beta"]);
  await expect(offCanvas(page)).toHaveCount(1);
  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(0);
  await expect(desktop(page).contentFrame().locator("header > h1")).toBeVisible();
});

test("dragged back elsewhere in the same round, into a Stack of the phone view, it takes a place there, in every view, as one move", async ({ page }) => {
  await moveTitleOff(page);
  await zoomOut(page);
  const button = (await phone(page).contentFrame().getByRole("button", { name: "Get started" }).boundingBox())!;

  // Below the button, in the hero's Stack: its last layer.
  await dragOffTo(page, { x: button.x, y: button.y + button.height + 8 });

  await expect(offCanvas(page)).toHaveCount(0);
  for (const shown of [desktop(page), tablet(page), phone(page)]) {
    await expect(shown.contentFrame().locator('[data-testid="hero"] > h1')).toBeVisible();
    expect(await shown.contentFrame().locator('[data-testid="hero"] > *').last().evaluate((el) => el.localName)).toBe("h1");
  }
  expect(await changeNames(page)).toEqual(["Move · 03Kind"]);
});

test("dragged back between the cards of the Grid, it takes the cell there, in every view", async ({ page }) => {
  await moveTitleOff(page);
  await zoomOut(page);
  const freeze = (await desktop(page).contentFrame().locator("article").nth(0).boundingBox())!;
  const arrange = (await desktop(page).contentFrame().locator("article").nth(1).boundingBox())!;

  // In the gap between the first two cards, in the Grid itself: a card is the deepest that could hold it.
  await dragOffTo(page, { x: (freeze.x + freeze.width + arrange.x) / 2 - 3, y: arrange.y + arrange.height / 2 - 3 });

  await expect(offCanvas(page)).toHaveCount(0);
  for (const shown of [desktop(page), tablet(page), phone(page)]) {
    const cells = shown.contentFrame().locator("main > div:has(> article) > *");
    await expect.poll(() => cells.evaluateAll((els) => els.map((el) => el.localName))).toEqual(["article", "h1", "article", "article", "article"]);
  }
  expect(await changeNames(page)).toEqual(["Move · 03Kind"]);
});

test("edited off the canvas, dragged back into a Frame's empty space, it is put back there, free, looking as it does off the canvas, in every view; undone, it is off the canvas again", async ({ page }) => {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "height: 240px; margin: 16px 0; background: #eee";
    document.querySelector("main")!.append(board);
  });
  await moveTitleOff(page);
  const opacity = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");
  const look = await lookOf(offCanvas(page).contentFrame().locator("h1"));
  const board = desktop(page).contentFrame().locator("#board");
  await board.scrollIntoViewIfNeeded();
  const area = (await board.boundingBox())!;
  const zoom = await desktop(page).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);

  // Its top left 40 × 30 canvas px into the board (pressed 3 screen px inside it).
  await dragOffTo(page, { x: area.x + 40 * zoom, y: area.y + 30 * zoom });

  await expect(offCanvas(page)).toHaveCount(0);
  for (const shown of [desktop(page), tablet(page), phone(page)]) {
    const back = shown.contentFrame().locator("#board > h1");
    await expect(back).toHaveText("03Kind");
    await expect(back).toHaveCSS("opacity", "0.5");
    await expect(back).toHaveCSS("position", "absolute");
  }
  const back = desktop(page).contentFrame().locator("#board > h1");
  expect(await lookOf(back)).toEqual(look);
  const at = await back.evaluate((el) => {
    const [r, b] = [el.getBoundingClientRect(), el.parentElement!.getBoundingClientRect()];
    return { x: r.left - b.left, y: r.top - b.top };
  });
  expect(Math.abs(at.x - 40)).toBeLessThanOrEqual(2);
  expect(Math.abs(at.y - 30)).toBeLessThanOrEqual(2);
  // Its deletion where it was stays: it is put back new, as it is off the canvas.
  await expect(desktop(page).contentFrame().locator("header > h1")).toBeHidden();
  expect(await changeNames(page)).toEqual(["Delete · 03Kind", "Put back · 03Kind"]);

  await page.keyboard.press(`${mod}+z`);
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(offCanvas(page).contentFrame().locator("h1")).toHaveCSS("opacity", "0.5");
  await expect(desktop(page).contentFrame().locator("#board > h1")).toHaveCount(0);
  await expect(badge(page)).toHaveAccessibleName("1 change not applied yet");
});

test("a layer moved off the canvas as a copy, dragged back, is put back as a copy of it, new on the canvas", async ({ page }) => {
  await enterEditMode(page);
  await pan(page, 400);
  const view = (await desktop(page).boundingBox())!;
  await select(page, "03Kind");
  const title = desktop(page).contentFrame().locator("h1");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x - 200, view.y + 100, { steps: 10 });
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(offCanvas(page)).toHaveCount(1);
  await expect(badge(page)).toHaveCount(0);
  const p = (await desktop(page).contentFrame().locator('[data-testid="hero"] > p').boundingBox())!;

  await dragOffTo(page, { x: p.x, y: p.y + p.height - 6 });

  await expect(desktop(page).contentFrame().locator("h1")).toHaveCount(2);
  expect(await changeNames(page)).toEqual(["Put back · 03Kind"]);
});
