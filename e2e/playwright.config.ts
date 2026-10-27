import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const example = fileURLToPath(new URL("../examples/vite-react19-tw4", import.meta.url));

/**
 * The dev server on this port, the production preview on the next, and the
 * ports after for the projects the tests start themselves. Two
 * checkouts running e2e at once set `VK_E2E_PORT` apart: locally an existing
 * server is reused, so on the same ports one would test the other's code.
 */
const PORT = Number(process.env.VK_E2E_PORT ?? 5310);
export const DEV_URL = `http://localhost:${PORT}`;
export const PREVIEW_URL = `http://localhost:${PORT + 1}`;
/** Where `install.spec.ts` serves the copy of the example it installs Vernier Kit into. */
export const INSTALL_PORT = PORT + 2;
export const TOGGLE_LABEL = "Vernier Kit: enter edit mode";
export const EXIT_LABEL = "Vernier Kit: back to preview mode";

/** Tests that work with the example project's real `.vernier/` folder: one at a time, across files too. */
const PROJECT_FILES = /(autosave|claim|round)\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  // Mode switches animate; tests that measure the canvas want it to settle at once. motion.spec.ts opts back in.
  use: { ...devices["Desktop Chrome"], channel: "chrome", trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "page", testIgnore: PROJECT_FILES },
    { name: "project files", testMatch: PROJECT_FILES, workers: 1 },
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
  ],
});
