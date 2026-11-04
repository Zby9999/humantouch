import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { designProblems, exampleOf, held, openObservers, shown, type Example } from "../bench/scenarios.ts";
import { STANDARD_SCENARIOS } from "../bench/scenarios-other-examples.ts";
import { DEV_URL, NEXT_URL, REACT18_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearThirdKindFolder, npx03kindIn } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`, and on
 * the other examples `scenarios-other-examples.ts`) still make the changes
 * they name in the editor layer, and the page shows none of them before an
 * Agent applies them: else the bench would measure a broken scenario, not the
 * Agent. Each runs on its own example's dev server.
 */

/** These tests save into the example projects' `.03kind/` for real; some scenarios edit the source, as a round before them. */
test.use({ keepRoundInMemory: false });
// The Next.js dev server compiles the page as it is first asked for.
test.setTimeout(120_000);

const SERVED: Record<Example, string> = { "vite-react19-tw4": DEV_URL, "vite-react18-tw3": REACT18_URL, "next-app-css-modules": NEXT_URL };
const folderOf = (example: Example) => fileURLToPath(new URL(`../../examples/${example}/`, import.meta.url));

/** The source files a round before edited, by path from the example's root, as they were: written back after each test. */
const originals = new Map<Example, Map<string, string>>();

/**
 * Until the example's dev server has `file` as `text` (`?raw`: its text as a string, untransformed, with or without a `;` after).
 * Waited for once the file is edited too: Vite reads `?raw` from disk the first time, and only from then on keeps it until it
 * sees the file change, as it does the module the page loads. Vite's examples only: no scenario on the Next.js one edits the
 * source as it is designed.
 */
async function served(example: Example, file: string, text: string) {
  if (example === "next-app-css-modules") throw new Error(`No scenario on ${example} is to edit its source as it is designed (${file}): the test cannot wait for Next.js to serve it`);
  await expect.poll(async () => (await fetch(`${SERVED[example]}/${file}?raw`)).text()).toContain(`export default ${JSON.stringify(text)}`);
}

test.afterEach(async () => {
  for (const [example, files] of originals) {
    for (const [file, text] of files) {
      const path = `${folderOf(example)}${file}`;
      if (readFileSync(path, "utf8") !== text) writeFileSync(path, text);
      // So the next test's page loads it as it was.
      await served(example, file, text);
    }
  }
  originals.clear();
});
test.afterAll(() => {
  for (const example of Object.keys(SERVED) as Example[]) clearThirdKindFolder(`${folderOf(example)}.03kind/`);
});

for (const scenario of STANDARD_SCENARIOS) {
  const example = exampleOf(scenario);
  const dir = folderOf(example);
  const thirdKindFolder = `${dir}.03kind/`;
  const changeSet = () => (existsSync(`${thirdKindFolder}changeset.json`) ? JSON.parse(readFileSync(`${thirdKindFolder}changeset.json`, "utf8")) : null);

  test(`scenario ${scenario.id} makes the changes it names, none shown on the page yet`, async ({ page, browser }) => {
    clearThirdKindFolder(thirdKindFolder);
    await page.goto(SERVED[example]);
    await page.locator("main").waitFor();
    await scenario.design({
      page,
      cli: npx03kindIn(dir),
      edit: async (file, from, to) => {
        const path = `${dir}${file}`;
        const text = readFileSync(path, "utf8");
        expect(text).toContain(from);
        if (!originals.has(example)) originals.set(example, new Map());
        if (!originals.get(example)!.has(file)) originals.get(example)!.set(file, text);
        writeFileSync(path, text.replace(from, to));
        await served(example, file, text.replace(from, to));
      },
      // The example's code is no commit of its own: the round before is taken back out after the test.
      settle: async () => {},
      changeSet,
    });
    // An undo has no round to apply: no ChangeSet.
    const saved = changeSet()?.changes ?? [];
    expect(saved.map((change: { kind: string }) => change.kind)).toEqual(scenario.changes.map((change) => change.kind));
    // What the page can check, and which values are Variables, as the scenario names them.
    expect(designProblems(scenario, saved)).toEqual([]);

    // Pages of their own, kept from the local service as the bench keeps them.
    const observers = await openObservers(browser, scenario, SERVED[example]);
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
