import { chromium, expect } from "@playwright/test";
import { DEV_URL, NEXT_URL, REACT18_URL, TOGGLE_LABEL } from "../playwright.config";
import { keepRoundIn } from "./fixtures";

/** The dev servers warmed up, by their names in the config's `webServer`. */
const SERVERS = [
  { name: "dev", url: DEV_URL },
  { name: "react 18", url: REACT18_URL },
  { name: "next", url: NEXT_URL },
];

/**
 * How long all of them together may take, side by side. Playwright starts this
 * only once each `webServer` URL has answered (within that entry's own timeout),
 * so the dev server is up by then; this covers loading the page in a browser,
 * whose code a cold Next.js may still be compiling, and entering edit mode, where
 * the editor layer is compiled for the first time. Long, as on a busy machine
 * those first compiles can take more than a minute (ticket 93).
 */
const WARM_UP_MS = 180_000;

/**
 * Enters edit mode once on each dev server before any test runs. The first
 * time, the dev server compiles the editor layer for the browser, which takes
 * a few seconds alone and well past a test's 5 seconds when the machine is
 * busy; the tests that came first then failed waiting for the canvas (ticket 93).
 * Here that one wait gets the time it needs; every test after waits as before.
 */
export default async function warmUp() {
  const browser = await chromium.launch();
  const deadline = Date.now() + WARM_UP_MS;
  const timeout = () => Math.max(1, deadline - Date.now());
  try {
    await Promise.all(
      SERVERS.map(async ({ name, url }) => {
        try {
          const context = await browser.newContext();
          // The round stays in memory, as in the tests: nothing is written to the example's `.03kind/`.
          await keepRoundIn(context);
          const page = await context.newPage();
          await page.goto(url, { timeout: timeout() });
          await page.getByRole("button", { name: TOGGLE_LABEL }).click({ timeout: timeout() });
          await expect(page.locator('iframe[title="Phone 390"]').contentFrame().locator("h1")).toBeVisible({ timeout: timeout() });
          await context.close();
        } catch (error) {
          // The cause's own message too: a global setup's error may be printed without its cause.
          const why = error instanceof Error ? error.message : String(error);
          throw new Error(`The "${name}" dev server (${url}) failed to warm up (edit mode in place, all servers within ${WARM_UP_MS / 1000} s): ${why}`, { cause: error });
        }
      }),
    );
  } finally {
    await browser.close();
  }
}
