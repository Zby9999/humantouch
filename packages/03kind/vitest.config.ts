import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", include: ["test/**/*.test.ts"], exclude: ["test/**/*.browser.test.ts"] },
      },
      {
        // Canvas code needs real layout and computed styles.
        extends: true,
        // Bundled before the first test file loads: found only as the tests import them, with Vite's cache
        // cold, they were bundled midway and the page reloaded, failing the files loading then (ticket 98).
        optimizeDeps: { include: ["preact", "preact/hooks", "preact/jsx-dev-runtime", "preact/test-utils"] },
        test: {
          name: "browser",
          include: ["test/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            // Playwright's own headless shell, not the installed Chrome: on macOS, Chrome takes focus as it starts.
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
