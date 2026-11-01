/**
 * The product was renamed to 03Kind (ticket 70). This keeps the old names from
 * being written back, in every file git tracks or would add and in their paths:
 * the old product name, lower case, capitalized or upper case; the old two-letter
 * prefix with a hyphen (which also covers the CSS variables and the data
 * attributes); and the same prefix in upper case with an underscore (the
 * environment variables). The list is in ticket 70's first acceptance item.
 *
 * The patterns are written with character classes so this file does not match
 * itself. Allowed, and only these, because they are records of the past:
 * - `docs/adr/`: decisions, kept as they were made.
 * - Tickets whose Status is done or resolved: what was done, under the names of
 *   the time. Ticket 23's Guide drafts (its `>` lines) are still checked: 59
 *   publishes them, so ticket 70 renamed them.
 * - Ticket 70 itself, which describes the rename.
 * - `.scratch/<the old folder>/logs/`: a session's decisions log.
 * - The path `.scratch/<the old folder>` wherever it is written: the tickets'
 *   folder keeps its name.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The old names, matched case by case as ticket 70 writes them. */
const OLD = /[v]ernier|[V]ernier|[V]ERNIER|[v]k-|[V]K_/g;
/** The tickets' folder, which keeps its name. */
const TICKET_FOLDER = /\.scratch\/[v]ernierkit\b/g;
const TICKET = /^\.scratch\/[^/]+\/issues\/(\d+)-[^/]+\.md$/;

/** Files git tracks, and the untracked ones it does not ignore (those it would add). */
function files(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return [...new Set(out.split("\0").filter(Boolean))];
}

/** Whether the ticket's Status line, the first one in the file, says done or resolved. */
const isDone = (text: string) => /^(done|resolved)\b/i.test(/^\**Status:?\**:?\s*(.*)$/m.exec(text)?.[1] ?? "");

/** The lines of `text` to check, or none when the whole file is a record of the past. */
export function linesToCheck(path: string, text: string): { line: number; text: string }[] {
  const lines = text.split("\n").map((text, i) => ({ line: i + 1, text }));
  if (path.startsWith("docs/adr/")) return [];
  if (/^\.scratch\/[^/]+\/logs\//.test(path)) return [];
  const ticket = TICKET.exec(path)?.[1];
  if (ticket === "70") return [];
  if (ticket === "23") return lines.filter((l) => l.text.startsWith(">"));
  if (ticket && isDone(text)) return [];
  return lines;
}

/** The old names in `text`, leaving out the tickets' folder. */
export const oldNames = (text: string) => text.replace(TICKET_FOLDER, "").match(OLD) ?? [];

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

test("no file or path in the repository uses the names before 03Kind (ticket 70)", () => {
  const found: string[] = [];
  for (const path of files()) {
    for (const name of oldNames(path)) found.push(`${path}: path has ${name}`);
    const full = ROOT + path;
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    const bytes = readFileSync(full);
    if (isBinary(bytes)) continue;
    for (const { line, text } of linesToCheck(path, bytes.toString("utf8"))) {
      for (const name of oldNames(text)) found.push(`${path}:${line}: ${name}`);
    }
  }
  assert.deepEqual(found, [], `old names found:\n${found.join("\n")}`);
});

test("the old names are caught in each form ticket 70 lists, and the tickets' folder is not", () => {
  const [v, V] = ["v", "V"];
  for (const s of [`${v}ernier`, `${V}ernier Kit`, `${V}ERNIERKIT_SERVICE`, `--${v}k-accent`, `data-${v}k-loc`, `class="${v}k-panel"`, `${V}K_E2E_PORT`]) {
    assert.notDeepEqual(oldNames(s), [], s);
  }
  assert.deepEqual(oldNames(`.scratch/${v}ernierkit/issues/70-rename-to-03kind.md`), []);
  assert.notDeepEqual(oldNames(`.scratch/${v}ernierkit/issues/x.md and .${v}ernier/`), []);
  assert.deepEqual(oldNames("03Kind, third-kind, --tk-accent, data-tk-loc, TK_E2E_PORT, Shift+1, Vk"), []);
});

test("only the records of the past are let through", () => {
  const old = `${"V"}ernier`;
  const done = `# 12: x\n\n**Status:** done\n\n${old}\n`;
  const open = `# 12: x\n\n**Status:** ready-for-agent\n\n${old}\n`;
  assert.deepEqual(linesToCheck("docs/adr/0001-x.md", old), []);
  assert.deepEqual(linesToCheck(".scratch/f/logs/x.md", old), []);
  assert.deepEqual(linesToCheck(".scratch/f/issues/70-rename-to-03kind.md", old), []);
  assert.deepEqual(linesToCheck(".scratch/f/issues/12-x.md", done), []);
  assert.deepEqual(linesToCheck(".scratch/f/issues/12-x.md", open)[4], { line: 5, text: old });
  assert.deepEqual(linesToCheck(".scratch/f/issues/23-x.md", `**Status:** done\n${old}\n> Install ${old}\n`), [{ line: 3, text: `> Install ${old}` }]);
  assert.equal(linesToCheck(".scratch/f/issues/12-x.md", `${open}**Status:** done\n`).length, 7);
  assert.equal(linesToCheck("docs/goals.md", old).length, 1);
  assert.equal(linesToCheck("packages/x/adr/y.ts", old).length, 1);
});
