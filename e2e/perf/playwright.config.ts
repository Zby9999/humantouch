import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The performance tests (ticket 22): the editor layer on the React 18 +
 * Tailwind v3 example's large page, about 5000 elements, with the desktop,
 * tablet and phone views all showing it. Run on their own, with `pnpm test:perf`:
 * `pnpm test:e2e` reads `e2e/playwright.config.ts`, whose tests are in `e2e/tests`.
 *
 * The numbers that count are taken in a windowed Google Chrome, on the
 * designer's computer: Playwright's headless shell has no GPU compositing and
 * draws its frames on a timer of its own, not with the screen. That Chrome
 * comes to the front as it starts, so ask the designer first.
 *
 * `VK_PERF_HEADLESS=1` runs them in Playwright's headless shell instead, for
 * comparing numbers before and after a change while developing. Those numbers
 * are no verdict: the targets are not checked.
 */
export const HEADLESS = process.env.VK_PERF_HEADLESS === "1";
/** This run, named by when it started: the runner sets it, so its workers all see the same. */
export const RUN = (process.env.VK_PERF_RUN ??= new Date().toISOString().replace(/[:.]/g, "-"));
/** The example's dev server, on a port of its own, so it can run beside the e2e tests' servers. */
const PORT = Number(process.env.VK_PERF_PORT ?? 5390);
export const BIG_URL = `http://localhost:${PORT}/big.html`;
/** How the window is sized: on the designer's screen, at its own pixel density. */
export const WINDOW = { width: 1440, height: 900 };

const react18Example = fileURLToPath(new URL("../../examples/vite-react18-tw3", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: /\.perf\.ts$/,
  // Apart from the e2e tests' own: each run clears its output folder.
  outputDir: "../../test-results/perf",
  // One at a time: measurements taken side by side would slow each other down.
  workers: 1,
  fullyParallel: false,
  timeout: 10 * 60_000,
  reporter: [["list"]],
  use: HEADLESS
    ? { browserName: "chromium", headless: true, viewport: WINDOW, deviceScaleFactor: 2 }
    : {
        browserName: "chromium",
        channel: "chrome",
        headless: false,
        // No emulated viewport: the window as it is, at the screen's own pixel density.
        viewport: null,
        launchOptions: { args: [`--window-size=${WINDOW.width},${WINDOW.height}`] },
      },
  webServer: {
    cwd: react18Example,
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BIG_URL,
    reuseExistingServer: !process.env.CI,
  },
});
