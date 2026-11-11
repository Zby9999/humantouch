/**
 * The product was renamed twice: to the name before this one in ticket 70, and to
 * Human Touch in ticket 133. This keeps both sets of old names from being written
 * back, in every file git tracks or would add and in their paths.
 *
 * The first set, ticket 70's:
 * - the old product name, lower case, capitalized or upper case;
 * - the old two-letter prefix with a hyphen (which also covers the CSS variables
 *   and the data attributes), and in upper case with an underscore (the
 *   environment variables). These are the forms in ticket 70's first acceptance item;
 * - the internal identifiers ticket 70 renamed too (names on `window` or `dataset`
 *   in the tests and the bench), which the forms above miss: the prefix in lower
 *   case at the start of a word and before a capital, or after two underscores in
 *   either case.
 *
 * The second set, ticket 133's, in the same forms:
 * - the product name as written (digits first), in any case; the names written
 *   where an identifier cannot start with a digit: the name in two words joined,
 *   in camel, Pascal, kebab and upper snake case. The name in two words with a
 *   space is let through: it is the examples' title, and the tests use it as a
 *   layer's name and text;
 * - its two-letter prefix with a hyphen, and in upper case with an underscore,
 *   anywhere in a word (a regular expression's `\b` or `VITE_` comes before it);
 * - the prefix in lower case at the start of a word and before a capital, or after
 *   two underscores in either case.
 *
 * The patterns are written with character classes so this file does not match
 * itself. Allowed, and only these, because they are records of the past:
 * - `docs/adr/`: decisions, kept as they were made.
 * - Tickets whose Status is done or resolved: what was done, under the names of
 *   the time. Ticket 23's Guide drafts (its `>` lines) are still checked for the
 *   first set: 59 published them, so ticket 70 renamed them. For the second set
 *   they are a record like the rest of 23: the Guide lives in the README now.
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

/** The old names of ticket 70, matched case by case. */
const OLD = /[v]ernier|[V]ernier|[V]ERNIER|[v]k-|[V]K_|\b[v]k[A-Z]|__[v]k|__[V]K/g;
/** The old names of ticket 133, matched case by case; the name in two words with a space is not among them. */
const OLD_133 = /[0]3[kK][iI][nN][dD]|[T]hirdKind|[t]hirdKind|[t]hird-kind|[T]HIRD_KIND|[t]k-|[T]K_|\b[t]k[A-Z]|__[t]k|__[T]K/g;
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

/**
 * The lines of `text` to check, or "whole" when the file is a record of the past, let through with its path.
 * `set` is the rename: 70 checks ticket 23's Guide drafts, 133 lets 23 through as the done ticket it is.
 */
function linesToCheck(path: string, text: string, set: 70 | 133 = 70): "whole" | { line: number; text: string }[] {
  const lines = text.split("\n").map((text, i) => ({ line: i + 1, text }));
  if (path.startsWith("docs/adr/") || LOGS.test(path)) return "whole";
  if (set === 70 && GUIDE_DRAFTS_TICKET.test(path)) return lines.filter((l) => l.text.startsWith(">"));
  if (TICKET.test(path) && isDone(text)) return "whole";
  return lines;
}

/** The old names in `text`, leaving out the tickets' folder. */
const oldNames = (text: string, set: 70 | 133 = 70) => text.replace(TICKET_FOLDER, "").match(set === 70 ? OLD : OLD_133) ?? [];

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

for (const set of [70, 133] as const) {
  test(`no file or path in the repository uses the names ticket ${set} renamed`, () => {
    const found: string[] = [];
    for (const path of files()) {
      const full = ROOT + path;
      const bytes = existsSync(full) && statSync(full).isFile() ? readFileSync(full) : Buffer.alloc(0);
      const lines = isBinary(bytes) ? [] : linesToCheck(path, bytes.toString("utf8"), set);
      if (lines === "whole") continue;
      for (const name of oldNames(path, set)) found.push(`${path}: path has ${name}`);
      for (const { line, text } of lines) {
        for (const name of oldNames(text, set)) found.push(`${path}:${line}: ${name}`);
      }
    }
    assert.deepEqual(found, [], `old names found:\n${found.join("\n")}`);
  });
}

test("the old names are caught in each form, and the tickets' folder and the new names are not", () => {
  const [v, V] = ["v", "V"];
  for (const s of [`${v}ernier`, `${V}ernier Kit`, `${V}ERNIERKIT_SERVICE`, `--${v}k-accent`, `data-${v}k-loc`, `class="${v}k-panel"`, `${V}K_E2E_PORT`, `window.${v}kSeen`, `window.__${v}kDraw`, `__${V}K_BENCH`, `__${V}KBENCH`]) {
    assert.notDeepEqual(oldNames(s), [], s);
  }
  assert.deepEqual(oldNames(`.scratch/${v}ernierkit/issues/70-rename-to-03kind.md`), []);
  assert.notDeepEqual(oldNames(`.scratch/${v}ernierkit/issues/x.md and .${v}ernier/`), []);
  assert.deepEqual(oldNames(`Human Touch, human-touch, --ht-accent, data-ht-loc, HT_E2E_PORT, Shift+1, Vk, window.htSeen, __htDraw, __HT_BENCH, d${v}kA`), []);
});

test("ticket 133's old names are caught in each form, and the tickets' folder, the examples' title and the new names are not", () => {
  const [zero, t, T, k] = ["0", "t", "T", "k"];
  const name = `${zero}3${k}ind`;
  for (const s of [name, `${zero}3Kind`, `${zero}3KIND`, `npx ${name} init`, `.${name}/`, `${T}hirdKind`, `with${T}hirdKind()`, `${t}hirdKind()`, `<${t}hird-kind>`, `__${T}HIRD_KIND__`, `--${t}k-accent`, `data-${t}k-loc`, `class="${t}k-panel"`, `${T}K_E2E_PORT`, `window.${t}kSeen`, `window.__${t}kDraw`, `__${T}K_BENCH`, `npx${zero}3${k}ind(`, `/\\b${t}k-ping\\b/`, `VITE_${T}K_WRITE_FIXTURE`]) {
    assert.notDeepEqual(oldNames(s, 133), [], s);
  }
  assert.deepEqual(oldNames(`.scratch/${"v"}ernierkit/issues/133-rename-to-human-touch.md`, 133), []);
  assert.deepEqual(oldNames(`<h1>${T}hird Kind</h1>, layer(page, "${T}hird Kind Studio"), Human Touch, humantouch, humanTouch(), <HumanTouch />, <human-touch>, --ht-accent, data-ht-loc, HT_E2E_PORT, window.htSeen, __htDraw, __HT_BENCH, network, desk-top, ${zero}3 ${k}inds`, 133), []);
});

test("for ticket 133's names, ticket 23 is let through whole once done, like the other done tickets", () => {
  const old = `${"0"}3Kind`;
  const tickets = `.scratch/${"v"}ernierkit`;
  assert.equal(linesToCheck(`${tickets}/issues/23-x.md`, `**Status:** done\n${old}\n> Install ${old}\n`, 133), "whole");
  assert.equal(linesToCheck(`${tickets}/issues/23-x.md`, `**Status:** ready-for-agent\n> Install ${old}\n`, 133).length, 3);
  assert.equal(linesToCheck("docs/adr/0001-x.md", old, 133), "whole");
  assert.equal(linesToCheck(`${tickets}/logs/x.md`, old, 133), "whole");
  assert.equal(linesToCheck("README.md", old, 133).length, 1);
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
