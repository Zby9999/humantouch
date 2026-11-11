import { readFileSync } from "node:fs";
import { canvasInPlace, expect, steadyBox, test, type Frame, type Locator, type Page } from "./fixtures";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";

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
