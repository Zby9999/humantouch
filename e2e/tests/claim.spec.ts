import { rmSync } from "node:fs";
import { DEV_URL, TOGGLE_LABEL } from "../playwright.config";
import { expect, test, type Page } from "./fixtures";
import { readVernier, VERNIER, vernierkit } from "./project-files";

/** These tests save into the example project's `.vernier/` for real. */
test.use({ keepRoundInMemory: false });

test.beforeEach(() => rmSync(VERNIER, { recursive: true, force: true }));
test.afterAll(() => rmSync(VERNIER, { recursive: true, force: true }));

function canvas(page: Page) {
  return page.locator('iframe[title="Canvas"]').contentFrame();
}

async function setField(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Design" }).getByRole("textbox", { name, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

test("claim takes the designer's changes and prints change notes for the Agent", async ({ page }) => {
  await page.goto(DEV_URL);
  await page.getByRole("button", { name: TOGGLE_LABEL }).click();
  await expect(canvas(page).locator("h1")).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers" });
  await layers.getByRole("treeitem", { name: "Card", exact: true }).first().click();
  await setField(page, "Fill color", "ff0000");
  await setField(page, "Corner radius", "4");
  // React's root element, from index.html: no source marker.
  await layers.getByRole("treeitem").first().click();
  await page.getByRole("complementary", { name: "Design" }).getByRole("button", { name: "Add fill" }).click();
  await expect.poll(() => readVernier("changeset.json")?.changes.length).toBe(3);

  const notes = await vernierkit("claim");

  expect(readVernier("state.json")).toEqual({ status: "claimed", done: [] });
  const [, fill, radius, root] = notes.split(/^## /m);
  expect(fill).toMatch(/^1\. Fill\n/);
  expect(fill).toContain("- **Kind:** Style\n");
  expect(fill).toMatch(/- \*\*Location:\*\* `src\/components\/Card\.tsx:\d+:\d+`\n/);
  expect(fill).toMatch(/- \*\*Scope:\*\* This usage only: Card used at `src\/App\.tsx:\d+:\d+`, inside App used at `src\/main\.tsx:\d+:\d+`\. It renders 3 instances/);
  expect(fill).toContain("- **Design intent:** Change the fill from #FFFFFF to #FF0000.\n");
  expect(fill).toContain("- **Reference style:** `background-color: rgb(255 0 0 / 1)`\n");
  expect(radius).toContain("- **Design intent:** Change the corner radius from 12px to 4px.\n");
  expect(root).toContain("- **Location:** **Not located.**");
  expect(root).toContain('`<div id="root">`');
});

test("with no changes, claim says so and leaves the round as it is", async () => {
  expect(await vernierkit("claim")).toMatch(/^No design changes to apply/);
  expect(readVernier("state.json")).toBeNull();
});
