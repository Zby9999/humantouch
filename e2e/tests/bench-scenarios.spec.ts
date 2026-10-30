import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { SCENARIOS, shown, widthsOf } from "../bench/scenarios.ts";
import { DEV_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearVernier, EXAMPLE, readVernier, VERNIER, vernierkit } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`) still
 * make the changes they name in the editor layer, and the page shows none of
 * them before an Agent applies them: else the bench would measure a broken
 * scenario, not the Agent.
 */

/** These tests save into the example project's `.vernier/` for real; one scenario edits the source, as a round before it. */
test.use({ keepRoundInMemory: false });
test.setTimeout(90_000);

const APP = `${EXAMPLE}src/App.tsx`;
const original = readFileSync(APP, "utf8");

test.beforeEach(() => clearVernier(VERNIER));
test.afterEach(async () => {
  if (readFileSync(APP, "utf8") !== original) writeFileSync(APP, original);
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/App.tsx`)).text()).includes("font-display text-4xl")).toBe(true);
});
test.afterAll(() => clearVernier(VERNIER));

for (const scenario of SCENARIOS) {
  test(`scenario ${scenario.id} makes the changes it names, none shown on the page yet`, async ({ page, browser }) => {
    await page.goto(DEV_URL);
    await page.locator("main").waitFor();
    await scenario.design({
      page,
      cli: vernierkit,
      edit: async (file, from, to) => {
        const text = readFileSync(`${EXAMPLE}${file}`, "utf8");
        expect(text).toContain(from);
        writeFileSync(`${EXAMPLE}${file}`, text.replace(from, to));
      },
      // The example's code is no commit of its own: the round before is taken back out after the test.
      settle: async () => {},
      changeSet: () => readVernier("changeset.json"),
    });
    const saved = readVernier("changeset.json").changes;
    expect(saved.map((change: { kind: string }) => change.kind)).toEqual(scenario.changes.map((change) => change.kind));

    // Pages of their own, kept from the local service as the bench keeps them.
    const pages = new Map<number, Page>();
    for (const width of widthsOf(scenario)) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.route((url) => url.hostname === "127.0.0.1", (route) => route.abort());
      const observer = await context.newPage();
      await observer.goto(DEV_URL);
      await observer.locator("main").waitFor();
      pages.set(width, observer);
    }
    expect(await shown(pages, scenario, saved)).toEqual(scenario.changes.map((change) => (change.shows ? false : null)));
    for (const observer of pages.values()) await observer.context().close();
  });
}
