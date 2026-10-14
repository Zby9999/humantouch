import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const example = fileURLToPath(new URL("../examples/vite-react19-tw4", import.meta.url));

export const DEV_URL = "http://localhost:5310";
export const PREVIEW_URL = "http://localhost:5311";
export const TOGGLE_LABEL = "Vernier Kit: enter edit mode";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { ...devices["Desktop Chrome"], channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      name: "dev",
      cwd: example,
      command: "pnpm exec vite --port 5310 --strictPort",
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: "preview",
      cwd: example,
      command: "pnpm exec vite build && pnpm exec vite preview --port 5311 --strictPort",
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
