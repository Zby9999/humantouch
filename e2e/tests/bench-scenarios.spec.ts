import { readFileSync, writeFileSync } from "node:fs";
import { openObservers, SCENARIOS, shown } from "../bench/scenarios.ts";
import { DEV_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearThirdKindFolder, EXAMPLE, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`) still
 * make the changes they name in the editor layer, and the page shows none of
 * them before an Agent applies them: else the bench would measure a broken
 * scenario, not the Agent.
 */

/** These tests save into the example project's `.03kind/` for real; one scenario edits the source, as a round before it. */
test.use({ keepRoundInMemory: false });
test.setTimeout(90_000);

const APP = `${EXAMPLE}src/App.tsx`;
const original = readFileSync(APP, "utf8");

test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterEach(async () => {
  if (readFileSync(APP, "utf8") !== original) writeFileSync(APP, original);
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/App.tsx`)).text()).includes("font-display text-4xl")).toBe(true);
});
test.afterAll(() => clearThirdKindFolder(THIRD_KIND_FOLDER));

for (const scenario of SCENARIOS) {
  test(`scenario ${scenario.id} makes the changes it names, none shown on the page yet`, async ({ page, browser }) => {
    await page.goto(DEV_URL);
    await page.locator("main").waitFor();
    await scenario.design({
      page,
      cli: npx03kind,
      edit: async (file, from, to) => {
        const text = readFileSync(`${EXAMPLE}${file}`, "utf8");
        expect(text).toContain(from);
        writeFileSync(`${EXAMPLE}${file}`, text.replace(from, to));
      },
      // The example's code is no commit of its own: the round before is taken back out after the test.
      settle: async () => {},
      changeSet: () => readThirdKindFile("changeset.json"),
    });
    const saved = readThirdKindFile("changeset.json").changes;
    expect(saved.map((change: { kind: string }) => change.kind)).toEqual(scenario.changes.map((change) => change.kind));

    // Pages of their own, kept from the local service as the bench keeps them.
    const observers = await openObservers(browser, scenario, DEV_URL);
    try {
      expect(await shown(observers.pages, scenario, saved)).toEqual(scenario.changes.map((change) => (change.shows ? false : null)));
    } finally {
      await observers.close();
    }
  });
}
