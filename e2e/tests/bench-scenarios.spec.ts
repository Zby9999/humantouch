import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { designProblems, exampleOf, held, openObservers, pageOf, shown, type Example } from "../bench/scenarios.ts";
import { STANDARD_SCENARIOS } from "../bench/scenarios-other-examples.ts";
import { DEV_URL, NEXT_URL, REACT18_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearHumanTouchFolder, npxHumanTouchIn } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`, and on
 * the other examples `scenarios-other-examples.ts`) still make the changes
 * they name in the editor layer, and the page shows none of them before an
 * Agent applies them: else the bench would measure a broken scenario, not the
 * Agent. Each runs on its own example's dev server.
 */

/** These tests save into the example projects' `.humantouch/` for real; some scenarios edit the source, as a round before them. */
test.use({ keepRoundInMemory: false });
// The Next.js dev server compiles the page as it is first asked for.
test.setTimeout(120_000);

const SERVED: Record<Example, string> = { "vite-react19-tw4": DEV_URL, "vite-react18-tw3": REACT18_URL, "next-app-css-modules": NEXT_URL };
const folderOf = (example: Example) => fileURLToPath(new URL(`../../examples/${example}/`, import.meta.url));

/**
 * What the example's dev server serves of `file`: its module as the page loads it, with no hot update's timestamp in it. Not
 * `?raw`: that request puts a module of its own in the dev server's module graph, and from then on an edit to the stylesheet
 * reloads the page whole, so a later test's page is gone as `done` checks it. Vite's examples only: no scenario on the Next.js
 * one edits the source as it is designed.
 */
async function served(example: Example, file: string): Promise<string> {
  if (example === "next-app-css-modules") throw new Error(`No scenario on ${example} is to edit its source as it is designed (${file}): the test cannot wait for Next.js to serve it`);
  return (await (await fetch(`${SERVED[example]}/${file}`)).text()).replace(/[?&]t=\d+/g, "");
}

/**
 * `text` with each run of Vite's hoisted CJS-interop lines (`const useState = __vite__cjsImport1_react["useState"];`) in a
 * fixed order, all else as it is. Vite hoists them in the order its import analysis resolves the CJS imports, which can differ
 * from one serve of the same file to the next under load (ticket 93): the wait for a restored file takes them in any order.
 */
const INTEROP = /const \w+ = [^;]*?__vite__cjsImport\d+_\w+[^;]*;/g;
const normalised = (text: string) => text.replace(/(?:const \w+ = [^;]*?__vite__cjsImport\d+_\w+[^;]*; ?)+/g, (run) => run.match(INTEROP)!.sort().join(""));

/** The source files a round before edited, by their paths: as they were, and as the dev server served them then. Written back after each test. */
const originals = new Map<string, { example: Example; file: string; text: string; served: string }>();

test.afterEach(async () => {
  for (const [path, original] of originals) {
    if (readFileSync(path, "utf8") !== original.text) writeFileSync(path, original.text);
    // So the next test's page loads it as it was. The design waits for its page to take an edit in, by what the page shows.
    await expect.poll(async () => normalised(await served(original.example, original.file))).toBe(normalised(original.served));
  }
  originals.clear();
});
test.afterAll(() => {
  for (const example of Object.keys(SERVED) as Example[]) clearHumanTouchFolder(`${folderOf(example)}.humantouch/`);
});

for (const scenario of STANDARD_SCENARIOS) {
  const example = exampleOf(scenario);
  const dir = folderOf(example);
  const humanTouchFolder = `${dir}.humantouch/`;
  const changeSet = () => (existsSync(`${humanTouchFolder}changeset.json`) ? JSON.parse(readFileSync(`${humanTouchFolder}changeset.json`, "utf8")) : null);

  test(`scenario ${scenario.id} makes the changes it names, none shown on the page yet`, async ({ page, browser }) => {
    clearHumanTouchFolder(humanTouchFolder);
    await page.goto(pageOf(scenario, SERVED[example]));
    await page.locator("main").waitFor();
    await scenario.design({
      page,
      cli: npxHumanTouchIn(dir),
      edit: async (file, from, to) => {
        const path = `${dir}${file}`;
        const text = readFileSync(path, "utf8");
        expect(text).toContain(from);
        if (!originals.has(path)) originals.set(path, { example, file, text, served: await served(example, file) });
        writeFileSync(path, text.replace(from, to));
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
