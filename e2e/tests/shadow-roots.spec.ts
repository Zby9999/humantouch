import { readFileSync } from "node:fs";
import { canvasInPlace, expect, steadyBox, test, type Frame, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { DOUBLE_CLICK_MS } from "../../packages/humantouch/src/client/selection";

/**
 * A page of its own for shadow roots (ticket 135): the example's page, with
 * an open shadow root put at the top of it (`e2e/fixtures/shadow-roots.html`),
 * served at an address of its own, so the example and the bench's scenarios
 * stay as they are.
 */
const URL = `${DEV_URL}/shadow-roots`;
const FIXTURE = readFileSync(new globalThis.URL("../fixtures/shadow-roots.html", import.meta.url), "utf8");

const desktop = (page: Page) => page.locator('iframe[title="Canvas"]');
const tablet = (page: Page) => page.locator('iframe[title="Tablet 768"]');
const phone = (page: Page) => page.locator('iframe[title="Phone 390"]');

async function openPage(page: Page) {
  await page.route(URL, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("<body>", `<body>${FIXTURE}`);
    await route.fulfill({ response, body: html });
  });
  await page.goto(URL);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#shadow-host .title")).toHaveText("Shadow title");
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(phone(page).contentFrame().locator("h1")).toBeVisible();
  await canvasInPlace(page);
}

/** How the shadow root's layers look, in the page or in a view: Playwright's locators go into open shadow roots. */
function looks(at: Page | Frame | ReturnType<Locator["contentFrame"]>) {
  const read = (selector: string, names: string[]) =>
    at.locator(`#shadow-host ${selector}`).evaluate((el, names) => {
      const style = getComputedStyle(el);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
    }, names);
  return Promise.all([
    at.locator("#shadow-host .title").textContent(),
    at.locator("#shadow-host .body").textContent(),
    read(".title", ["color", "font-size", "font-weight"]),
    read(".panel", ["background-color", "border-top-left-radius", "padding-top"]),
    at.locator("#shadow-host").evaluate((el) => [getComputedStyle(el).paddingTop, Math.round(el.getBoundingClientRect().height)]),
  ]);
}

test("an open shadow root shows on the canvas as on the page, its style element's and its constructable sheet's styles too, and in each view at that view's width", async ({ page }) => {
  await openPage(page);
  const onPage = await looks(page);
  expect(onPage.slice(0, 2)).toEqual(["Shadow title", "Shadow body"]);
  expect(onPage[2].color).toBe("rgb(200, 0, 0)");
  expect(onPage[3]["background-color"]).toBe("rgb(255, 230, 0)");
  expect(onPage[3]["border-top-left-radius"]).toBe("16px");
  await enterEditMode(page);

  await expect.poll(() => looks(desktop(page).contentFrame())).toEqual(onPage);
  // The tablet's 768px and the phone's 390px, as a window that wide would show them.
  const atTablet = await looks(tablet(page).contentFrame());
  expect(atTablet[2].color).toBe("rgb(0, 150, 0)");
  expect(atTablet[3]["border-top-left-radius"]).toBe("16px");
  const atPhone = await looks(phone(page).contentFrame());
  expect(atPhone[2].color).toBe("rgb(0, 0, 200)");
  expect(atPhone[3]["border-top-left-radius"]).toBe("4px");
  expect(atPhone[3]["background-color"]).toBe("rgb(255, 230, 0)");
  expect(atPhone.slice(0, 2)).toEqual(["Shadow title", "Shadow body"]);
  // The script's animation in it at its end, in every view; the page's carries on.
  for (const view of [desktop(page), tablet(page), phone(page)]) await expect(view.contentFrame().locator("#shadow-host .fade")).toHaveCSS("opacity", "0.4");
  expect(Number(await page.locator("#shadow-host .fade").evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  // The closed one: on the page its content shows; on the canvas, the host shows as one with none, its own content alone.
  await expect(page.locator("#closed-host")).toContainText("Light of the closed host");
  const closed = desktop(page).contentFrame().locator("#closed-host");
  await expect(closed).toHaveText("Light of the closed host");
  expect(await closed.evaluate((el) => el.shadowRoot === null && !el.ownerDocument.documentElement.outerHTML.includes("Closed content"))).toBe(true);
});

/** Where a box is drawn over the canvas, rounded. */
async function boxOn(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return [box.x, box.y, box.width, box.height].map(Math.round);
}

/** Where a layer on the canvas is, rounded, once it is still. */
async function placeOf(locator: Locator) {
  const box = await steadyBox(locator);
  return [box.x, box.y, box.width, box.height].map(Math.round);
}

test("the layers in an open shadow root are selected, hovered and listed under their host, and the Design panel shows their values (ticket 136)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const selection = page.locator('.ht-selection[data-view="Desktop"]');
  const design = page.getByRole("complementary", { name: "Design" });
  const tree = page.getByRole("tree", { name: "Layers" });
  const selectedRow = tree.getByRole("treeitem", { selected: true });

  // A plain click selects the outermost layer, the host, as for any other layer at the top of the page.
  await canvas.locator("#shadow-host .title").click();
  await expect.poll(() => boxOn(selection)).toEqual(await placeOf(canvas.locator("#shadow-host")));
  await expect(selectedRow).toHaveAttribute("aria-level", "1");

  // A double click goes a layer deeper, across the shadow boundary: the panel the shadow root shows, its fill and radius in the Design panel.
  await canvas.locator("#shadow-host .title").dblclick();
  await expect.poll(() => boxOn(selection)).toEqual(await placeOf(canvas.locator("#shadow-host .panel")));
  await expect(selectedRow).toHaveAttribute("aria-level", "2");
  await expect(design.getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FFE600");
  await expect(design.getByRole("textbox", { name: "Corner radius" })).toHaveValue("16");

  // Esc goes back up to the host; ⌘-click goes straight to the deepest layer, the title, under the panel under the host in Layers.
  await page.keyboard.press("Escape");
  await expect(selectedRow).toHaveAttribute("aria-level", "1");
  const title = await placeOf(canvas.locator("#shadow-host .title"));
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(title[0] + title[2] / 2, title[1] + title[3] / 2);
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(() => boxOn(selection)).toEqual(title);
  await expect(selectedRow).toHaveText("Shadow title");
  await expect(selectedRow).toHaveAttribute("aria-level", "3");
  // The host's own paragraph, slotted at the end of the panel, is listed there, where it shows.
  const rows = await tree.getByRole("treeitem").evaluateAll((rows) => rows.slice(0, 6).map((row) => `${row.getAttribute("aria-level")} ${row.textContent!.trim()}`));
  expect(rows).toEqual(["1 Stack", "2 Stack", "3 Shadow title", "3 Shadow body", "3 Fading", "3 Slotted note"]);
  // Its text styles, from the shadow root's own style element.
  await expect(design.getByRole("textbox", { name: "Font size" })).toHaveValue("24");

  // Hovered, a layer beside it in the shadow root has its outline.
  const body = await placeOf(canvas.locator("#shadow-host .body"));
  await page.mouse.move(body[0] + body[2] / 2, body[1] + body[3] / 2);
  await expect.poll(() => boxOn(page.locator('.ht-hover[data-view="Desktop"]'))).toEqual(body);
  // With ⌥ held, the distance from the title to it: as far as the canvas has them apart.
  const gap = await canvas.locator("#shadow-host .body").evaluate((el) => {
    const title = el.parentElement!.querySelector(".title")!.getBoundingClientRect();
    return String(Math.round(el.getBoundingClientRect().top - title.bottom));
  });
  await page.keyboard.down("Alt");
  await page.mouse.move(body[0] + body[2] / 2 + 1, body[1] + body[3] / 2);
  await expect(page.locator('.ht-mark[data-type="distance"] .ht-mark-label')).toHaveText([gap]);
  await page.keyboard.up("Alt");
  await expect(page.locator('.ht-mark[data-type="distance"]')).toHaveCount(0);
  // Clicked, it is selected, at the depth of the title.
  await page.mouse.click(body[0] + body[2] / 2, body[1] + body[3] / 2);
  await expect(selectedRow).toHaveText("Shadow body");

  // Esc twice: the panel, then the host; once more, nothing.
  await page.keyboard.press("Escape");
  await expect.poll(() => boxOn(selection)).toEqual(await placeOf(canvas.locator("#shadow-host .panel")));
  await page.keyboard.press("Escape");
  await expect(selectedRow).toHaveAttribute("aria-level", "1");

  // ⌘-click on the slotted paragraph: selected, under the panel it shows in.
  const note = await placeOf(canvas.locator("#shadow-host > .note"));
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(note[0] + note[2] / 2, note[1] + note[3] / 2);
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(() => boxOn(selection)).toEqual(note);
  await expect(selectedRow).toHaveText("Slotted note");
  await expect(selectedRow).toHaveAttribute("aria-level", "3");
});

test("in the Phone view too, a layer in the shadow root is selected at that view's width (ticket 136)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const view = phone(page).contentFrame();
  const panel = await placeOf(view.locator("#shadow-host .panel"));
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(panel[0] + 4, panel[1] + 4);
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(() => boxOn(page.locator('.ht-selection[data-view="Phone"]'))).toEqual(panel);
  await expect(page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Corner radius" })).toHaveValue("4");
});

test("saved with the round and the page loaded again, the shadow root shows as it did, in each view", async ({ page }) => {
  await openPage(page);
  const onPage = await looks(page);
  await enterEditMode(page);

  // A change, so the round is saved, canvas and all: the host given a red fill.
  await desktop(page).contentFrame().locator("#shadow-host .title").click();
  const saved = page.waitForRequest(
    (request) => new globalThis.URL(request.url()).pathname === "/round" && request.method() === "PUT" && !!request.postData()?.includes("rgb(255 0 0"),
  );
  const design = page.getByRole("complementary", { name: "Design" });
  await design.getByRole("button", { name: "Add fill" }).click();
  const hex = design.getByRole("textbox", { name: "Fill color", exact: true });
  await hex.fill("ff0000");
  await hex.press("Enter");
  await saved;

  await page.reload();
  await expect(page.locator("#shadow-host .title")).toHaveText("Shadow title");
  await enterEditMode(page);
  // The saved canvas, put back: the host red, as it was edited.
  const host = desktop(page).contentFrame().locator("#shadow-host");
  await expect(host).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect.poll(() => looks(desktop(page).contentFrame())).toEqual(onPage);
  expect((await looks(tablet(page).contentFrame()))[2].color).toBe("rgb(0, 150, 0)");
  const atPhone = await looks(phone(page).contentFrame());
  expect(atPhone[2].color).toBe("rgb(0, 0, 200)");
  expect(atPhone[3]["border-top-left-radius"]).toBe("4px");
});

test("a layer in the shadow root given a fill and a corner radius shows them on the canvas and in every view, and in the change list; one changed in the Phone view, at the Phone's widths alone; undone and redone (ticket 137)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const design = page.getByRole("complementary", { name: "Design" });
  const panelIn = (view: Locator) => view.contentFrame().locator("#shadow-host .panel");
  const looksIn = (view: Locator) => panelIn(view).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopLeftRadius]);
  const setField = async (name: string, value: string) => {
    const field = design.getByRole("textbox", { name, exact: true });
    await field.fill(value);
    await field.press("Enter");
  };

  // The panel, a layer of the shadow root, a double click into its host.
  await desktop(page).contentFrame().locator("#shadow-host .title").dblclick();
  await expect(design.getByRole("textbox", { name: "Fill color", exact: true })).toHaveValue("FFE600");
  await setField("Fill color", "ff0000");
  await setField("Corner radius", "8");
  for (const view of [desktop(page), tablet(page), phone(page)]) await expect.poll(() => looksIn(view)).toEqual(["rgb(255, 0, 0)", "8px"]);
  // The page's other layers as they were: the edit styles are the shadow root's own.
  await expect(desktop(page).contentFrame().locator("h1")).not.toHaveCSS("background-color", "rgb(255, 0, 0)");
  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // In the Phone view: its corner radius at the Phone's widths alone.
  const atPhone = await placeOf(panelIn(phone(page)));
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(atPhone[0] + 4, atPhone[1] + 4);
  await page.keyboard.up("ControlOrMeta");
  await expect(design.getByRole("textbox", { name: "Corner radius" })).toHaveValue("8");
  await setField("Corner radius", "24");
  await expect.poll(() => looksIn(phone(page))).toEqual(["rgb(255, 0, 0)", "24px"]);
  expect(await looksIn(tablet(page))).toEqual(["rgb(255, 0, 0)", "8px"]);
  expect(await looksIn(desktop(page))).toEqual(["rgb(255, 0, 0)", "8px"]);

  // Undone: the Phone's radius, then the radius at every width; redone, back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => looksIn(phone(page))).toEqual(["rgb(255, 0, 0)", "8px"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => looksIn(desktop(page))).toEqual(["rgb(255, 0, 0)", "16px"]);
  await expect.poll(() => looksIn(phone(page))).toEqual(["rgb(255, 0, 0)", "4px"]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => looksIn(desktop(page))).toEqual(["rgb(255, 0, 0)", "8px"]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => looksIn(phone(page))).toEqual(["rgb(255, 0, 0)", "24px"]);
  expect(await looksIn(tablet(page))).toEqual(["rgb(255, 0, 0)", "8px"]);
});

test("the layers in the shadow root of a custom element a dependency defines are locked, used where the element is, as a third-party component's are; the change records it so (ticket 137)", async ({ page }) => {
  // A module served from `node_modules`, as a Web Components library is: what defines `<acme-chip>` is a dependency.
  await page.route(`${DEV_URL}/node_modules/acme-elements/chip.js`, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `customElements.define("acme-chip", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<style>span { display: inline-block; padding: 4px 8px; background: rgb(0, 0, 255); color: white }</style><span part="label">Chip</span>';
  }
});`,
    }),
  );
  await page.route(URL, async (route) => {
    const response = await route.fetch();
    const chip = '<acme-chip id="chip"></acme-chip><script type="module" src="/node_modules/acme-elements/chip.js"></script>';
    await route.fulfill({ response, body: (await response.text()).replace("<body>", `<body>${chip}`) });
  });
  await page.goto(URL);
  await expect(page.locator("#chip span")).toHaveText("Chip");
  await enterEditMode(page);

  const chip = page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: "acme-chip", exact: true });
  await expect(chip).toHaveCount(1);
  await chip.click();
  const saved = page.waitForRequest((request) => new globalThis.URL(request.url()).pathname === "/round" && request.method() === "PUT" && !!request.postData()?.includes('"width"'));
  const width = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name: "Width", exact: true });
  await width.fill("90");
  await width.press("Enter");
  const { changeSet } = JSON.parse((await saved).postData()!);
  expect(changeSet.changes[0].target).toMatchObject({ locked: true, loc: null, chain: [{ component: "acme-chip", thirdParty: true, webComponent: true }], shadowRoot: '<acme-chip id="chip">' });
});

/** The tags and classes of what the panel in the shadow root holds, in a view. */
function panelChildren(view: Locator) {
  return view
    .contentFrame()
    .locator("#shadow-host .panel")
    .evaluate((el) => [...el.children].map((child) => `${child.localName}${child.className ? `.${child.className}` : ""}`));
}

/** ⌘-clicks the middle of `locator` on the canvas: the deepest layer there is selected. */
async function selectDeepest(page: Page, locator: Locator) {
  const box = await placeOf(locator);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(box[0] + box[2] / 2, box[1] + box[3] / 2);
  await page.keyboard.up("ControlOrMeta");
}

/** Presses on `from`'s middle and drags to `to`, in steps, as a hand would; let go unless `drop` is false. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }, { drop = true } = {}) {
  const start = await placeOf(from);
  await page.mouse.move(start[0] + start[2] / 2, start[1] + start[3] / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (drop) await page.mouse.up();
}

/** The first rows of Layers, each its level and name. */
function rowsOf(page: Page, count: number) {
  return page
    .getByRole("tree", { name: "Layers" })
    .getByRole("treeitem")
    .evaluateAll((rows, count) => rows.slice(0, count).map((row) => `${row.getAttribute("aria-level")} ${row.textContent!.trim()}`), count);
}

test("in the shadow root, two layers swap places, one's words are typed anew and two are made a Stack: on the canvas, in every view, in Layers and in the change list; undone, as they were (ticket 138)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const tree = page.getByRole("tree", { name: "Layers" });
  const views = [desktop(page), tablet(page), phone(page)];
  const before = ["h2.title", "p.body", "p.fade", "slot"];
  for (const view of views) expect(await panelChildren(view)).toEqual(before);

  // The body dragged above the title, in the panel's Stack.
  await selectDeepest(page, canvas.locator("#shadow-host .body"));
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Shadow body");
  const title = await placeOf(canvas.locator("#shadow-host .title"));
  await dragTo(page, canvas.locator("#shadow-host .body"), { x: title[0] + title[2] / 2, y: title[1] + 2 }, { drop: false });
  await expect(page.locator(".ht-drop-line")).toBeVisible();
  await page.mouse.up();
  const swapped = ["p.body", "h2.title", "p.fade", "slot"];
  for (const view of views) await expect.poll(() => panelChildren(view)).toEqual(swapped);
  await expect.poll(() => rowsOf(page, 6)).toEqual(["1 Stack", "2 Stack", "3 Shadow body", "3 Shadow title", "3 Fading", "3 Slotted note"]);

  // The title's words typed anew, a double click into it.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await selectDeepest(page, canvas.locator("#shadow-host .title"));
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Shadow title");
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await canvas.locator("#shadow-host .title").dblclick();
  await expect(canvas.locator("#shadow-host .title")).toHaveAttribute("contenteditable", "plaintext-only");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Shadow heading");
  await page.keyboard.press("Escape");
  for (const view of views) await expect(view.contentFrame().locator("#shadow-host .title")).toHaveText("Shadow heading");
  await expect.poll(() => rowsOf(page, 6)).toEqual(["1 Stack", "2 Stack", "3 Shadow body", "3 Shadow heading", "3 Fading", "3 Slotted note"]);

  // The body and the title made a Stack, ⇧A.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await tree.getByRole("treeitem", { name: "Shadow body", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Shadow heading", exact: true }).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Shift+A");
  for (const view of views) await expect.poll(() => panelChildren(view)).toEqual(["div", "p.fade", "slot"]);
  const stacked = (view: Locator) =>
    view
      .contentFrame()
      .locator("#shadow-host .panel > div")
      .evaluate((el) => [...el.children].map((child) => child.localName));
  for (const view of views) await expect.poll(() => stacked(view)).toEqual(["p", "h2"]);
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveAccessibleName("Stack");
  await expect.poll(() => rowsOf(page, 6)).toEqual(["1 Stack", "2 Stack", "3 Stack", "4 Shadow body", "4 Shadow heading", "3 Fading"]);

  // Three changes in the change list.
  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveCount(3);
  await page.keyboard.press("Escape");

  // Undone, all three: the panel as it was, in every view.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+z");
  for (const view of views) await expect.poll(() => panelChildren(view)).toEqual(before);
  for (const view of views) await expect(view.contentFrame().locator("#shadow-host .title")).toHaveText("Shadow title");
});

/** The toast at the bottom of the canvas, a new one: one shown before is marked seen (`sawToast`). */
const toast = (page: Page) => page.getByRole("status").locator(".ht-toast span:not([data-seen])");
/** Marks the toast showing now as seen, so the next check waits for a new one, though its words be the same. */
const sawToast = (page: Page) => page.getByRole("status").locator(".ht-toast span").evaluateAll((spans) => spans.forEach((span) => span.setAttribute("data-seen", "")));
const marks = (page: Page, type: string) => page.locator(`.ht-mark[data-type="${type}"]`);
/** The words the toast says when a layer is let go past a shadow root's edge, by the edge (`SHADOW_EDGE_HINTS`). */
const EDGE_HINTS = {
  out: "This layer stays inside its component.",
  in: "Layers can't be moved into this component.",
  slotted: "This layer's place is set by its component.",
  paste: "Layers can't be pasted into this component.",
};

/** A Frame at the top of the shadow root, after the panel, 240 px tall, with an absolute layer in it, 60 × 40 at 100, 120. */
async function addShadowBoard(page: Page) {
  await page.evaluate(() => {
    const board = Object.assign(document.createElement("div"), { id: "board" });
    board.style.cssText = "position: relative; height: 240px; margin-top: 16px; background: rgb(238, 238, 238)";
    const mark = Object.assign(document.createElement("div"), { id: "mark" });
    mark.style.cssText = "position: absolute; left: 100px; top: 120px; width: 60px; height: 40px; background: rgb(204, 204, 204)";
    board.append(mark);
    document.getElementById("shadow-host")!.shadowRoot!.append(board);
  });
}

/** Where a layer in the shadow root is in its board, in a view's px: its border box from the board's top left. */
function placeInBoard(view: Locator, selector: string) {
  return view
    .contentFrame()
    .locator(`#shadow-host ${selector}`)
    .evaluate((el) => {
      const board = (el.getRootNode() as ShadowRoot).getElementById("board")!;
      const [r, b] = [el.getBoundingClientRect(), board.getBoundingClientRect()];
      return { x: Math.round(r.left - b.left), y: Math.round(r.top - b.top), height: Math.round(r.height) };
    });
}

/** How large a view is drawn: screen px per px of the view. */
function zoomOf(view: Locator) {
  return view.evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
}

test("in the shadow root, a layer is placed freely in a Frame there, snapping with its lines as it is dragged and resized, and the Frame takes another place among the shadow root's own layers; let go past the shadow root's edge, nothing moves, and the toast says why (ticket 138)", async ({ page }) => {
  await openPage(page);
  await addShadowBoard(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const views = [desktop(page), tablet(page), phone(page)];
  const tree = page.getByRole("tree", { name: "Layers" });
  const zoom = await zoomOf(desktop(page));

  // The fading paragraph, out of the panel's Stack into the board, its left 3 screen px off the mark's: it snaps there, with a line.
  await selectDeepest(page, canvas.locator("#shadow-host .fade"));
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Fading");
  const fade = await placeOf(canvas.locator("#shadow-host .fade"));
  const board = await placeOf(canvas.locator("#shadow-host #board"));
  await dragTo(page, canvas.locator("#shadow-host .fade"), { x: board[0] + 100 * zoom + 3 + fade[2] / 2, y: board[1] + 30 * zoom + fade[3] / 2 }, { drop: false });
  await expect(marks(page, "line").first()).toBeVisible();
  await page.mouse.up();
  await expect(marks(page, "line")).toHaveCount(0);
  for (const view of views) await expect(view.contentFrame().locator("#shadow-host #board > .fade")).toHaveCount(1);
  await expect.poll(async () => (await placeInBoard(desktop(page), ".fade")).x).toBe(100);
  expect(await panelChildren(desktop(page))).toEqual(["h2.title", "p.body", "slot"]);
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Fading");

  // The mark's top handle dragged to 3 screen px below the paragraph's bottom: it snaps there too, with a line.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await selectDeepest(page, canvas.locator("#shadow-host #mark"));
  const placed = await placeInBoard(desktop(page), ".fade");
  const handle = page.locator('.ht-handles[data-view="Desktop"] .ht-handle[data-handle="n"]');
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 + (placed.y + placed.height - 120) * zoom + 3, { steps: 8 });
  await expect(marks(page, "line").first()).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await placeInBoard(desktop(page), "#mark")).y).toBe(placed.y + placed.height);
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await selectDeepest(page, canvas.locator("#shadow-host .fade"));

  // Let go over the page's heading, out of the shadow root: it stays, and the toast says why.
  const h1 = await placeOf(canvas.locator("h1"));
  await dragTo(page, canvas.locator("#shadow-host .fade"), { x: h1[0] + h1[2] / 2, y: h1[1] + h1[3] / 2 });
  await expect(toast(page)).toHaveText(EDGE_HINTS.out);
  await sawToast(page);
  await expect(canvas.locator("#shadow-host #board > .fade")).toHaveCount(1);
  await expect.poll(async () => (await placeInBoard(desktop(page), ".fade")).x).toBe(100);

  // The slotted note, written in the host's light DOM, goes nowhere: not even before the title, where it shows.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await selectDeepest(page, canvas.locator("#shadow-host > .note"));
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Slotted note");
  const title = await placeOf(canvas.locator("#shadow-host .title"));
  await dragTo(page, canvas.locator("#shadow-host > .note"), { x: title[0] + title[2] / 2, y: title[1] + 2 });
  await expect(toast(page)).toHaveText(EDGE_HINTS.slotted);
  await sawToast(page);
  expect(await panelChildren(desktop(page))).toEqual(["h2.title", "p.body", "slot"]);
  await expect(canvas.locator("#shadow-host > .note")).toHaveCount(1);

  // A layer of the page let go in the shadow root's board: it stays where it was.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await tree.getByRole("treeitem", { name: "Button", exact: true }).click();
  const boardNow = await placeOf(canvas.locator("#shadow-host #board"));
  await dragTo(page, canvas.locator('[data-testid="hero"] > button'), { x: boardNow[0] + 20 * zoom, y: boardNow[1] + boardNow[3] - 20 * zoom });
  await expect(toast(page)).toHaveText(EDGE_HINTS.in);
  await sawToast(page);
  await expect(canvas.locator('[data-testid="hero"] > button')).toHaveCount(1);
  await expect(canvas.locator("#shadow-host button")).toHaveCount(0);

  // The board dragged above the panel, at the top of the shadow root: the host's layers in another order, in every view.
  await tree.getByRole("treeitem", { name: "Frame", exact: true }).first().click();
  const panel = await placeOf(canvas.locator("#shadow-host .panel"));
  await dragTo(page, canvas.locator("#shadow-host #board"), { x: panel[0] + panel[2] / 2, y: panel[1] + 2 });
  const order = (view: Locator) =>
    view
      .contentFrame()
      .locator("#shadow-host")
      .evaluate((host) => [...host.shadowRoot!.children].filter((el) => el.localName === "div").map((el) => el.id || el.className));
  for (const view of views) await expect.poll(() => order(view)).toEqual(["board", "panel"]);
  await page.keyboard.press("ControlOrMeta+z");
  for (const view of views) await expect.poll(() => order(view)).toEqual(["panel", "board"]);
});

/** A Stack at the top of the page: a layer of the page, then two hosts, each a line in its shadow root. */
async function addCardRow(page: Page) {
  await page.evaluate(() => {
    const row = Object.assign(document.createElement("div"), { id: "row" });
    row.style.cssText = "display: flex; flex-direction: column; gap: 8px; padding: 8px";
    const lite = Object.assign(document.createElement("div"), { id: "lite" });
    lite.style.cssText = "height: 40px; background: rgb(200, 200, 200)";
    row.append(lite);
    for (const id of ["card-a", "card-b"]) {
      const host = Object.assign(document.createElement("div"), { id });
      host.style.cssText = "height: 80px; background: rgb(238, 238, 238)";
      host.attachShadow({ mode: "open" }).innerHTML = `<p style="margin: 0">Card ${id.slice(-1).toUpperCase()}</p>`;
      row.append(host);
    }
    document.body.prepend(row);
  });
}

test("a layer of the page let go over the line in a host beside it, near the host's edge, goes beside the host, as beside any layer; over the host's middle, it stays, and the toast says why (ticket 138)", async ({ page }) => {
  await openPage(page);
  await addCardRow(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const views = [desktop(page), tablet(page), phone(page)];
  const order = (view: Locator) =>
    view
      .contentFrame()
      .locator("#row")
      .evaluate((row) => [...row.children].map((el) => el.id));
  for (const view of views) expect(await order(view)).toEqual(["lite", "card-a", "card-b"]);

  // Over the line in card B's shadow root, near card B's top: before card B, in the Stack around it.
  await selectDeepest(page, canvas.locator("#lite"));
  const card = await placeOf(canvas.locator("#card-b"));
  await dragTo(page, canvas.locator("#lite"), { x: card[0] + card[2] / 2, y: card[1] + 3 }, { drop: false });
  await expect(page.locator(".ht-drop-line")).toBeVisible();
  await page.mouse.up();
  for (const view of views) await expect.poll(() => order(view)).toEqual(["card-a", "lite", "card-b"]);

  // Over card B's middle, which would take it but for the shadow root's edge: it stays, not beside card B either.
  await sawToast(page);
  const cardNow = await placeOf(canvas.locator("#card-b"));
  await dragTo(page, canvas.locator("#lite"), { x: cardNow[0] + cardNow[2] / 2, y: cardNow[1] + cardNow[3] / 2 });
  await expect(toast(page)).toHaveText(EDGE_HINTS.in);
  for (const view of views) expect(await order(view)).toEqual(["card-a", "lite", "card-b"]);

  await page.keyboard.press("ControlOrMeta+z");
  for (const view of views) await expect.poll(() => order(view)).toEqual(["lite", "card-a", "card-b"]);
});

test("a layer of the page copied and pasted into the shadow root's Stack goes nowhere, and the toast says why (ticket 138)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const tree = page.getByRole("tree", { name: "Layers" });
  const rows = tree.getByRole("treeitem");
  const buttons = canvas.locator("button");
  const [rowCount, buttonCount] = [await rows.count(), await buttons.count()];

  await tree.getByRole("treeitem", { name: "Button", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+c");
  // The panel's Stack, in the host's shadow root.
  await tree.getByRole("treeitem", { name: "Stack", exact: true }).nth(1).click();
  await expect.poll(() => boxOn(page.locator('.ht-selection[data-view="Desktop"]'))).toEqual(await placeOf(canvas.locator("#shadow-host .panel")));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(toast(page)).toHaveText(EDGE_HINTS.paste);
  await expect(rows).toHaveCount(rowCount);
  await expect(buttons).toHaveCount(buttonCount);
  await expect(canvas.locator("#shadow-host button")).toHaveCount(0);
});

test("in the shadow root, a layer is deleted and another copied; the host copied has its shadow root, its layers apart from the original's; in every view and the change list; undone, as they were (ticket 138)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const canvas = desktop(page).contentFrame();
  const views = [desktop(page), tablet(page), phone(page)];
  const tree = page.getByRole("tree", { name: "Layers" });
  const design = page.getByRole("complementary", { name: "Design" });
  const before = ["h2.title", "p.body", "p.fade", "slot"];

  // The fading paragraph deleted: gone in every view.
  await selectDeepest(page, canvas.locator("#shadow-host .fade"));
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("Fading");
  await page.keyboard.press("Delete");
  for (const view of views) await expect(view.contentFrame().locator("#shadow-host .fade")).toBeHidden();
  await expect(tree.getByRole("treeitem", { name: "Fading", exact: true })).toHaveCount(0);

  // The body copied, beside it, in every view.
  await page.waitForTimeout(DOUBLE_CLICK_MS);
  await selectDeepest(page, canvas.locator("#shadow-host .body"));
  await page.keyboard.press("ControlOrMeta+d");
  for (const view of views) await expect.poll(() => panelChildren(view)).toEqual(["h2.title", "p.body", "p.body", "p.fade", "slot"]);

  // The host copied: its copy has the shadow root, with the canvas's own styles in it, in every view.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await tree.getByRole("treeitem", { name: "Stack", exact: true }).first().click();
  await page.keyboard.press("ControlOrMeta+d");
  for (const view of views) await expect(view.contentFrame().locator("#shadow-host")).toHaveCount(2);
  const copy = canvas.locator("#shadow-host").nth(1);
  expect(await copy.evaluate((el) => el.shadowRoot!.adoptedStyleSheets.length)).toBeGreaterThan(0);
  await expect(copy.locator(".panel")).toHaveCSS("background-color", "rgb(255, 230, 0)");

  // The copy's panel given a red fill: the original's stays yellow, in every view.
  // Its panel, the second host's, in Layers: the host, its panel, then the copy and its panel.
  await expect.poll(() => rowsOf(page, 8)).toEqual(["1 Stack", "2 Stack", "3 Shadow title", "3 Shadow body", "3 Shadow body", "3 Slotted note", "1 Stack", "2 Stack"]);
  await tree.getByRole("treeitem", { name: "Stack", exact: true }).nth(3).click();
  await expect.poll(() => boxOn(page.locator('.ht-selection[data-view="Desktop"]'))).toEqual(await placeOf(copy.locator(".panel")));
  const fill = design.getByRole("textbox", { name: "Fill color", exact: true });
  await expect(fill).toHaveValue("FFE600");
  await fill.fill("ff0000");
  await fill.press("Enter");
  for (const view of views) {
    await expect(view.contentFrame().locator("#shadow-host").nth(1).locator(".panel")).toHaveCSS("background-color", "rgb(255, 0, 0)");
    await expect(view.contentFrame().locator("#shadow-host").first().locator(".panel")).toHaveCSS("background-color", "rgb(255, 230, 0)");
  }

  // Four changes in the change list.
  await page.locator("[data-ht-changes-opener]").click();
  await expect(page.getByRole("dialog", { name: "Changes" }).getByRole("listitem")).toHaveCount(4);
  await page.keyboard.press("Escape");

  // Undone, all four: as it was, in every view.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ControlOrMeta+z");
  for (const view of views) {
    await expect(view.contentFrame().locator("#shadow-host")).toHaveCount(1);
    await expect.poll(() => panelChildren(view)).toEqual(before);
    await expect(view.contentFrame().locator("#shadow-host .fade")).toBeVisible();
  }
});
