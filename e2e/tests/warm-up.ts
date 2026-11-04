import { chromium, expect } from "@playwright/test";
import { DEV_URL, NEXT_URL, REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { keepRoundIn } from "./fixtures";

/**
 * Enters edit mode once on each dev server before any test runs. The first
 * time, the dev server compiles the editor layer for the browser, which takes
 * a few seconds alone and well past a test's 5 seconds when the machine is
 * busy; the tests that came first then failed waiting for the canvas (ticket 93).
 * Here that one wait gets the time it needs; every test after waits as before.
 */
export default async function warmUp() {
  const browser = await chromium.launch();
  try {
    await Promise.all(
      [DEV_URL, REACT18_URL, NEXT_URL].map(async (url) => {
        const context = await browser.newContext();
        // The round stays in memory, as in the tests: nothing is written to the example's `.03kind/`.
        await keepRoundIn(context);
        const page = await context.newPage();
        await page.goto(url, { timeout: 120_000 });
        await page.getByRole("button", { name: TOGGLE_LABEL }).click({ timeout: 120_000 });
        await expect(page.locator('iframe[title="Phone 390"]').contentFrame().locator("h1")).toBeVisible({ timeout: 120_000 });
        await context.close();
      }),
    );
  } finally {
    await browser.close();
  }
}
