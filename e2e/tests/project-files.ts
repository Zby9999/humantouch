import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The example project, which the dev server serves. */
export const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));
export const THIRD_KIND_FOLDER = `${EXAMPLE}.03kind/`;
const CLI = fileURLToPath(new URL("../../packages/03kind/dist/cli.js", import.meta.url));

/**
 * Takes a `.03kind/` folder away. The dev server's service may be writing
 * into it meanwhile: as the test before closes its page, the service rewrites
 * `checks.json`, and a file put in while the folder is being emptied fails the
 * removal (ENOTEMPTY). Node tries the removal again for that.
 */
export function clearThirdKindFolder(folder: string) {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
}

/** Runs `npx 03kind …` in the example project, as an Agent would. */
export async function npx03kind(...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

/** A JSON file in `.03kind/`, or null when it is not there. */
export function readThirdKindFile(file: string) {
  const path = `${THIRD_KIND_FOLDER}${file}`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

/** What the dev server serves of a Card edited for one usage alone (`forTheLoopAlone`, or a prop the Card takes with a default, ticket 77): a test that puts the Card back waits till it serves none of it. */
export const CARD_EDITED = /"Your turn" \?|= "gap-2"|className = ""|fill = "bg-white"/;

/** How the scripted Agent tells the fourth card ("Your turn") from the loop's in a Card's code. */
const FOURTH = 'title === "Your turn"';

/**
 * A Card's source, `from` replaced with `to` in the classes of one of its
 * elements for the loop's three cards alone, as an Agent writes a change for
 * the loop's usage of the Card (ticket 77): the fourth card, the Card's other
 * usage, keeps its classes as they were. The scripted Agent keys it on the
 * card's title, so only the Card's file changes: `className="…"` becomes
 * `className={title === "Your turn" ? "…" : "…"}`, and a later change to the
 * same element changes the loop's side again.
 */
export function forTheLoopAlone(source: string, from: string, to: string): string {
  let done = false;
  const split = new RegExp(`className=\\{${FOURTH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\? "([^"]*)" : "([^"]*)"\\}`, "g");
  const once = (text: string, pattern: RegExp, write: (...classes: string[]) => string) =>
    text.replace(pattern, (all, ...groups: string[]) => {
      const classes = groups.slice(0, pattern === split ? 2 : 1);
      if (done || !classes.at(-1)!.includes(from)) return all;
      done = true;
      return write(...classes);
    });
  const again = once(source, split, (own, loop) => `className={${FOURTH} ? "${own}" : "${loop.replace(from, to)}"}`);
  if (done) return again;
  const first = once(source, /className="([^"]*)"/g, (classes) => `className={${FOURTH} ? "${classes}" : "${classes.replace(from, to)}"}`);
  if (!done) throw new Error(`No class list in the Card has ${from}`);
  return first;
}
