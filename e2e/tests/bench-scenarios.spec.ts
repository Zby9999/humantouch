import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { exampleOf, openObservers, shown, type Example } from "../bench/scenarios.ts";
import { STANDARD_SCENARIOS } from "../bench/scenarios-other-examples.ts";
import { DEV_URL, NEXT_URL, REACT18_URL } from "../playwright.config";
import { expect, test } from "./fixtures";
import { clearThirdKindFolder } from "./project-files";

/**
 * The applying bench's standard scenarios (`e2e/bench/scenarios.ts`, and on
 * the other examples `scenarios-other-examples.ts`) still make the changes
 * they name in the editor layer, and the page shows none of them before an
 * Agent applies them: else the bench would measure a broken scenario, not the
 * Agent. Each runs on its own example's dev server.
 */

/** These tests save into the example projects' `.03kind/` for real; one scenario edits the source, as a round before it. */
test.use({ keepRoundInMemory: false });
// The Next.js dev server compiles the page as it is first asked for.
test.setTimeout(120_000);

const CLI = fileURLToPath(new URL("../../packages/03kind/dist/cli.js", import.meta.url));
const SERVED: Record<Example, string> = { "vite-react19-tw4": DEV_URL, "vite-react18-tw3": REACT18_URL, "next-app-css-modules": NEXT_URL };
const folderOf = (example: Example) => fileURLToPath(new URL(`../../examples/${example}/`, import.meta.url));

/** The source files a scenario edited, as they were: put back after it. */
const touched = new Map<string, string>();

test.afterEach(async () => {
  for (const [file, original] of touched) if (readFileSync(file, "utf8") !== original) writeFileSync(file, original);
  touched.clear();
  // The React 19 example's App.tsx, put back, served as it is again before the next test opens a page.
  await expect.poll(async () => (await (await fetch(`${DEV_URL}/src/App.tsx`)).text()).includes("font-display text-4xl")).toBe(true);
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
      cli: async (...args) => (await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: dir })).stdout,
      edit: async (file, from, to) => {
        const path = `${dir}${file}`;
        const text = readFileSync(path, "utf8");
        expect(text).toContain(from);
        if (!touched.has(path)) touched.set(path, text);
        writeFileSync(path, text.replace(from, to));
      },
      // The example's code is no commit of its own: the round before is taken back out after the test.
      settle: async () => {},
      changeSet,
    });
    const saved = changeSet().changes;
    expect(saved.map((change: { kind: string }) => change.kind)).toEqual(scenario.changes.map((change) => change.kind));

    // Pages of their own, kept from the local service as the bench keeps them.
    const observers = await openObservers(browser, scenario, SERVED[example]);
    try {
      expect(await shown(observers.pages, scenario, saved)).toEqual(scenario.changes.map((change) => (change.shows ? false : null)));
    } finally {
      await observers.close();
    }
  });
}
