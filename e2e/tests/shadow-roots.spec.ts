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
});

test("a press on what the shadow root shows selects its host, as before (ticket 136 goes in)", async ({ page }) => {
  await openPage(page);
  await enterEditMode(page);
  const title = desktop(page).contentFrame().locator("#shadow-host .title");
  await title.click();
  const host = await steadyBox(desktop(page).contentFrame().locator("#shadow-host"));
  await expect.poll(async () => {
    const box = (await page.locator('.ht-selection[data-view="Desktop"]').boundingBox())!;
    return [box.x, box.y, box.width, box.height].map(Math.round);
  }).toEqual([host.x, host.y, host.width, host.height].map(Math.round));
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
