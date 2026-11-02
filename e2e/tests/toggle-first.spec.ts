import { readFileSync } from "node:fs";
import { DEV_URL, EXIT_LABEL, NEXT_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { gzipped, scripts, settle, TOGGLE_BUDGET } from "./loading";

/**
 * The file of the package a request on the Vite example is for, as published:
 * the example links the package from the workspace, so Vite serves its
 * `dist/` files one by one, from where they are on disk.
 */
function packageFile(url: string): string | null {
  const { pathname } = new URL(url);
  if (!pathname.startsWith("/@fs/") || !pathname.includes("/packages/03kind/dist/")) return null;
  return decodeURIComponent(pathname.slice("/@fs".length));
}

/** Gzipped, the files as published. Served, they also carry React Refresh, which the example's React plugin adds to the linked package, and a source map. */
const published = (files: string[]) => gzipped(files.map((file) => readFileSync(file)));

/** Requests whose URL `pick` names, as named, in the order the page made them. */
function record(page: Page, pick: (url: string) => string | null) {
  const names: string[] = [];
  page.on("request", (request) => {
    const name = pick(request.url());
    if (name && !names.includes(name)) names.push(name);
  });
  return names;
}

test("the page loads only the toggle, under 10KB gzipped; the rest of the editor layer loads as edit mode is first entered", async ({ page }) => {
  const files = record(page, packageFile);
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  await expect(toggle).toBeVisible();
  await settle(page);

  const atLoad = [...files];
  expect(atLoad.length).toBeGreaterThan(0);
  // In the output, to compare with the budget from one ticket to the next.
  console.log(`toggle as published: ${published(atLoad)} B gzipped of ${TOGGLE_BUDGET} B`);
  expect(published(atLoad)).toBeLessThanOrEqual(TOGGLE_BUDGET);

  await toggle.click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  const rest = files.slice(atLoad.length);
  expect(rest.length).toBeGreaterThan(0);
  // Most of the editor layer waited: four fifths of it, at least.
  expect(published(rest)).toBeGreaterThan(4 * published(atLoad));
});

test("on a Next.js page too, the rest of the editor layer loads only as edit mode is first entered", async ({ page }) => {
  const loaded = scripts(page);
  await page.goto(NEXT_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  await expect(toggle).toBeVisible();
  await settle(page);
  // Turbopack bundles the toggle with the page's own code: what tells the rest apart is the way back to preview mode.
  expect(await loaded.has(TOGGLE_LABEL)).toBe(true);
  expect(await loaded.has(EXIT_LABEL)).toBe(false);

  await toggle.click();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  expect(await loaded.has(EXIT_LABEL)).toBe(true);
});

test("while the rest of the editor layer loads, the toggle is busy, and pressing it again does not turn back", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/packages\/03kind\/dist\/editor\.dev\.js/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(DEV_URL);
  const toggle = page.getByRole("button", { name: TOGGLE_LABEL });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-busy", "true");
  await toggle.click();

  release();
  await expect(page.locator('iframe[title="Canvas"]').contentFrame().locator("h1")).toBeVisible();
  await expect(page.getByRole("button", { name: EXIT_LABEL })).toBeVisible();
});
