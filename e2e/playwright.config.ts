import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const example = fileURLToPath(new URL("../examples/vite-react19-tw4", import.meta.url));
const nextExample = fileURLToPath(new URL("../examples/next-app-css-modules", import.meta.url));
const react18Example = fileURLToPath(new URL("../examples/vite-react18-tw3", import.meta.url));

/**
 * The dev server on this port, the production preview on the next, and the
 * ports after for the projects the tests start themselves. Two
 * checkouts running e2e at once set `TK_E2E_PORT` apart: locally an existing
 * server is reused, so on the same ports one would test the other's code.
 */
const PORT = Number(process.env.TK_E2E_PORT ?? 5310);
export const DEV_URL = `http://localhost:${PORT}`;
export const PREVIEW_URL = `http://localhost:${PORT + 1}`;
/** Where `install.spec.ts` serves the copy of the example it installs Human Touch into. */
export const INSTALL_PORT = PORT + 2;
/** The Next.js example's dev server, with Turbopack. */
export const NEXT_URL = `http://localhost:${PORT + 3}`;
/** Where `next-install.spec.ts` serves its copy of the Next.js example, with webpack. */
export const NEXT_INSTALL_PORT = PORT + 4;
/** The React 18 + Tailwind v3 example's dev server. */
export const REACT18_URL = `http://localhost:${PORT + 5}`;
export const TOGGLE_LABEL = "Human Touch: enter edit mode";
export const EXIT_LABEL = "Human Touch: back to preview mode";

/** Tests that work with the example project's real `.humantouch/` folder: one at a time, across files too. */
const PROJECT_FILES = /(autosave|claim|round|applying-bench|bench-scenarios|code-changes)\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests",
  // Once the dev servers are up, edit mode is entered once on each: the first time is slow (ticket 93).
  globalSetup: "./tests/warm-up.ts",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  // Mode switches animate; tests that measure the canvas want it to settle at once. motion.spec.ts opts back in.
  // Playwright's own headless shell, not the installed Chrome: on macOS, Chrome takes focus as it starts.
  // 160px wider than Desktop Chrome's 1280: the panels grew from 240px to 320px each (designer, 2026-11-07), and the canvas between them stays 800px wide.
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 720 }, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "page", testIgnore: PROJECT_FILES },
    // Both projects use the same dev servers, and these tests edit the examples' source (a 3px border on the
    // Card, say) that the page tests measure, so they start once the page tests are done. To run only some
    // of them without the whole page project first, add `--no-deps`.
    { name: "project files", testMatch: PROJECT_FILES, workers: 1, dependencies: ["page"] },
  ],
  webServer: [
    {
      name: "dev",
      cwd: example,
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: "preview",
      cwd: example,
      command: `pnpm exec vite build && pnpm exec vite preview --port ${PORT + 1} --strictPort`,
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: "next",
      cwd: nextExample,
      command: `pnpm exec next dev --port ${PORT + 3}`,
      url: NEXT_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: "react 18",
      cwd: react18Example,
      command: `pnpm exec vite --port ${PORT + 5} --strictPort`,
      url: REACT18_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
