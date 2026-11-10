import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test } from "./fixtures";

test("the page not made into a canvas says so, and sends the designer to their Agent (designer, 2026-11-10)", async ({ page }) => {
  // The canvas iframe has no document to freeze the page into, as when 03Kind itself goes wrong.
  await page.addInitScript(() => {
    const own = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentDocument")!;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      configurable: true,
      get(this: HTMLIFrameElement) {
        return this.title === "Canvas" ? null : own.get!.call(this);
      },
    });
  });
  await page.goto(DEV_URL);
  await expect(page.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(page.getByRole("alert")).toHaveText("Couldn't turn this page into a canvas.Ask your Agent to look into it.");
  // One over the other.
  expect(await page.getByRole("alert").evaluate((el) => el.getClientRects().length && el.getBoundingClientRect().height)).toBeGreaterThan(24);
});
