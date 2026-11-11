import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The example project, which the dev server serves. */
export const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));
export const HUMAN_TOUCH_FOLDER = `${EXAMPLE}.humantouch/`;
const CLI = fileURLToPath(new URL("../../packages/humantouch/dist/cli.js", import.meta.url));

/**
 * Takes a `.humantouch/` folder away. The dev server's service may be writing
 * into it meanwhile: as the test before closes its page, the service rewrites
 * `checks.json`, and a file put in while the folder is being emptied fails the
 * removal (ENOTEMPTY). Node tries the removal again for that.
 */
export function clearHumanTouchFolder(folder: string) {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
}

/** Runs `npx humantouch …` in the example project, as an Agent would. */
export const npxHumanTouch = npxHumanTouchIn(EXAMPLE);

/** `npx humantouch …`, run in the project in `dir`, as an Agent would. */
export function npxHumanTouchIn(dir: string) {
  return async (...args: string[]): Promise<string> => (await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: dir })).stdout;
}

/**
 * A JSON file in `.humantouch/`, or null when it is not there. Ticket 93: the
 * service may take it away between a look and the read (a round discarded):
 * gone then, it is not there.
 */
export function readHumanTouchFile(file: string) {
  try {
    return JSON.parse(readFileSync(`${HUMAN_TOUCH_FOLDER}${file}`, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** What the dev server serves of a Card edited for one usage alone (`forTheLoopAlone`, or a prop the Card takes with a default, ticket 77): a test that puts the Card back waits till it serves none of it. */
export const CARD_EDITED = /"Your turn" \?|= "gap-2"|className = ""|fill = "bg-white"/;

/**
 * Whether what the dev server serves of a component (`served`) is its code as
 * `source` writes it: the same class strings, none edited in or taken out,
 * and nothing of a Card edited for one usage alone (`CARD_EDITED`). A test
 * that edits the code and puts it back waits for this before the next test
 * opens its page: the dev server's watcher may hear of the file put back
 * late, and till then serves the edit, so the next page would open on it
 * already (and an edit written the same again would bring nothing in).
 */
export function servesAsWritten(served: string, source: string): boolean {
  const classes = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]).sort().join("\n");
  return classes(served, /className: "([^"]*)"/g) === classes(source, /className="([^"]*)"/g) && !CARD_EDITED.test(served);
}

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
