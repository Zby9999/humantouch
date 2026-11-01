/**
 * The product was renamed to 03Kind (ticket 70). This keeps the old names from
 * being written back, in every file git tracks or would add and in their paths:
 * - the old product name, lower case, capitalized or upper case;
 * - the old two-letter prefix with a hyphen (which also covers the CSS variables
 *   and the data attributes), and in upper case with an underscore (the
 *   environment variables). These are the forms in ticket 70's first acceptance item;
 * - the internal identifiers ticket 70 renamed too (names on `window` or `dataset`
 *   in the tests and the bench), which the forms above miss: the prefix in lower
 *   case at the start of a word and before a capital, or after two underscores in
 *   either case.
 *
 * The patterns are written with character classes so this file does not match
 * itself. Allowed, and only these, because they are records of the past:
 * - `docs/adr/`: decisions, kept as they were made.
 * - Tickets whose Status is done or resolved: what was done, under the names of
 *   the time. Ticket 23's Guide drafts (its `>` lines) are still checked: 59
 *   publishes them, so ticket 70 renamed them.
 * - `logs/` beside the tickets: a session's decisions log.
 * - The path `.scratch/<the old folder>` wherever it is written: the tickets'
 *   folder keeps its name.
 * Ticket numbers start again in each folder under `.scratch/`, so 23 and `logs/`
 * are matched in the old folder only. A file let through whole is let through
 * with its path.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The old names, matched case by case. */
const OLD = /[v]ernier|[V]ernier|[V]ERNIER|[v]k-|[V]K_|\b[v]k[A-Z]|__[v]k|__[V]K/g;
/** The tickets' folder, which keeps its name: the pattern for its path, and the path wherever it is written. */
const TICKET_FOLDER_SOURCE = String.raw`\.scratch\/[v]ernierkit`;
const TICKET_FOLDER = new RegExp(String.raw`${TICKET_FOLDER_SOURCE}\b`, "g");
/** A ticket in any folder under `.scratch/`, and its number. */
const TICKET = /^\.scratch\/[^/]+\/issues\/(\d+)-[^/]+\.md$/;
/** Ticket 23, whose Guide drafts ticket 70 renamed, and the logs: both in the tickets' folder. */
const GUIDE_DRAFTS_TICKET = new RegExp(String.raw`^${TICKET_FOLDER_SOURCE}\/issues\/23-[^/]+\.md$`);
const LOGS = new RegExp(String.raw`^${TICKET_FOLDER_SOURCE}\/logs\/`);

/** Files git tracks, and the untracked ones it does not ignore (those it would add). */
function files(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return [...new Set(out.split("\0").filter(Boolean))];
}

/** Whether the ticket's Status line, the first one in the file, says done or resolved. */
const isDone = (text: string) => /^(done|resolved)\b/i.test(/^\**Status:?\**:?\s*(.*)$/m.exec(text)?.[1] ?? "");

/** The lines of `text` to check, or "whole" when the file is a record of the past, let through with its path. */
function linesToCheck(path: string, text: string): "whole" | { line: number; text: string }[] {
  const lines = text.split("\n").map((text, i) => ({ line: i + 1, text }));
  if (path.startsWith("docs/adr/") || LOGS.test(path)) return "whole";
  if (GUIDE_DRAFTS_TICKET.test(path)) return lines.filter((l) => l.text.startsWith(">"));
  if (TICKET.test(path) && isDone(text)) return "whole";
  return lines;
}

/** The old names in `text`, leaving out the tickets' folder. */
const oldNames = (text: string) => text.replace(TICKET_FOLDER, "").match(OLD) ?? [];

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

test("no file or path in the repository uses the names before 03Kind (ticket 70)", () => {
  const found: string[] = [];
  for (const path of files()) {
    const full = ROOT + path;
    const bytes = existsSync(full) && statSync(full).isFile() ? readFileSync(full) : Buffer.alloc(0);
    const lines = isBinary(bytes) ? [] : linesToCheck(path, bytes.toString("utf8"));
    if (lines === "whole") continue;
    for (const name of oldNames(path)) found.push(`${path}: path has ${name}`);
    for (const { line, text } of lines) {
      for (const name of oldNames(text)) found.push(`${path}:${line}: ${name}`);
    }
  }
  assert.deepEqual(found, [], `old names found:\n${found.join("\n")}`);
});

test("the old names are caught in each form, and the tickets' folder and the new names are not", () => {
  const [v, V] = ["v", "V"];
  for (const s of [`${v}ernier`, `${V}ernier Kit`, `${V}ERNIERKIT_SERVICE`, `--${v}k-accent`, `data-${v}k-loc`, `class="${v}k-panel"`, `${V}K_E2E_PORT`, `window.${v}kSeen`, `window.__${v}kDraw`, `__${V}K_BENCH`, `__${V}KBENCH`]) {
    assert.notDeepEqual(oldNames(s), [], s);
  }
  assert.deepEqual(oldNames(`.scratch/${v}ernierkit/issues/70-rename-to-03kind.md`), []);
  assert.notDeepEqual(oldNames(`.scratch/${v}ernierkit/issues/x.md and .${v}ernier/`), []);
  assert.deepEqual(oldNames(`03Kind, third-kind, --tk-accent, data-tk-loc, TK_E2E_PORT, Shift+1, Vk, window.tkSeen, __tkDraw, __TK_BENCH, d${v}kA`), []);
});

test("only the records of the past are let through, and 23 and the logs only in the tickets' folder", () => {
  const old = `${"V"}ernier`;
  const tickets = `.scratch/${"v"}ernierkit`;
  const done = `# 12: x\n\n**Status:** done\n\n${old}\n`;
  const open = `# 12: x\n\n**Status:** ready-for-agent\n\n${old}\n`;
  assert.equal(linesToCheck("docs/adr/0001-x.md", old), "whole");
  assert.equal(linesToCheck(`${tickets}/logs/x.md`, old), "whole");
  assert.equal(linesToCheck(`${tickets}/issues/12-x.md`, done), "whole");
  assert.equal(linesToCheck(".scratch/sandbox/issues/12-x.md", done), "whole");
  assert.deepEqual(linesToCheck(`${tickets}/issues/12-x.md`, open)[4], { line: 5, text: old });
  assert.equal(linesToCheck(`${tickets}/issues/70-x.md`, open).length, 6);
  assert.deepEqual(linesToCheck(`${tickets}/issues/23-x.md`, `**Status:** done\n${old}\n> Install ${old}\n`), [{ line: 3, text: `> Install ${old}` }]);
  assert.equal(linesToCheck(`${tickets}/issues/12-x.md`, `${open}**Status:** done\n`).length, 7);
  assert.equal(linesToCheck(".scratch/sandbox/logs/x.md", old).length, 1);
  assert.equal(linesToCheck(".scratch/sandbox/issues/23-x.md", done), "whole");
  assert.equal(linesToCheck(".scratch/sandbox/issues/23-x.md", open).length, 6);
  assert.equal(linesToCheck("docs/goals.md", old).length, 1);
  assert.equal(linesToCheck("packages/x/adr/y.ts", old).length, 1);
});
