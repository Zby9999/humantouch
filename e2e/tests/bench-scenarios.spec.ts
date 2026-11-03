import { readFileSync, writeFileSync } from "node:fs";
import { designProblems, held, openObservers, SCENARIOS, shown } from "../bench/scenarios.ts";
import { DEV_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearThirdKindFolder, EXAMPLE, readThirdKindFile, THIRD_KIND_FOLDER, npx03kind } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`) still
 * make the changes they name in the editor layer, and the page shows none of
 * them before an Agent applies them: else the bench would measure a broken
 * scenario, not the Agent.
 */

/** These tests save into the example project's `.03kind/` for real; some scenarios edit the source, as a round before them. */
test.use({ keepRoundInMemory: false });
test.setTimeout(90_000);

/** The example's files a round before edited, by path from its root, as they were: written back after each test. */
const originals = new Map<string, string>();

/**
 * Until the dev server has `file` as `text` (`?raw`: its text as a string, untransformed, with or without a `;` after). Waited
 * for once the file is edited too: the dev server reads `?raw` from disk the first time, and only from then on keeps it until
 * it sees the file change, as it does the module the page loads.
 */
const served = (file: string, text: string) => expect.poll(async () => (await fetch(`${DEV_URL}/${file}?raw`)).text()).toContain(`export default ${JSON.stringify(text)}`);

test.beforeEach(() => clearThirdKindFolder(THIRD_KIND_FOLDER));
test.afterEach(async () => {
  for (const [file, text] of originals) {
    if (readFileSync(`${EXAMPLE}${file}`, "utf8") !== text) writeFileSync(`${EXAMPLE}${file}`, text);
    // So the next test's page loads it as it was.
    await served(file, text);
  }
  originals.clear();
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
        if (!originals.has(file)) originals.set(file, text);
        expect(text).toContain(from);
        writeFileSync(`${EXAMPLE}${file}`, text.replace(from, to));
        await served(file, text.replace(from, to));
      },
      // The example's code is no commit of its own: the round before is taken back out after the test.
      settle: async () => {},
      changeSet: () => readThirdKindFile("changeset.json"),
    });
    // An undo has no round to apply: no ChangeSet.
    const saved = readThirdKindFile("changeset.json")?.changes ?? [];
    expect(saved.map((change: { kind: string }) => change.kind)).toEqual(scenario.changes.map((change) => change.kind));
    // What the page can check, and which values are Variables, as the scenario names them.
    expect(designProblems(scenario, saved)).toEqual([]);

    // Pages of their own, kept from the local service as the bench keeps them.
    const observers = await openObservers(browser, scenario, DEV_URL);
    try {
      expect(await shown(observers.pages, scenario, saved)).toEqual(scenario.changes.map((change) => (change.shows ? false : null)));
      // The scenario's own expectations the page tests: those kept hold already, the others not yet. The
      // source's (`sourceAsAtStart`) the bench checks, in a copy of its own: the example here is in this
      // repository, with no commit of its own to compare with.
      expect(await held(observers.pages, scenario)).toEqual((scenario.expectations ?? []).map((expectation) => (expectation.shows ? !!expectation.kept : null)));
    } finally {
      await observers.close();
    }
  });
}
