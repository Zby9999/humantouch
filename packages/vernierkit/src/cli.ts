/**
 * The command line, run by the Agent as the Skill tells it: `claim` takes the
 * round to apply and prints the change notes, `done <number> …` reports changes
 * applied and gives how the page checked them, `finish` ends the round, and
 * `last` prints the round before, to undo it by. `init`, `doctor` and
 * `remove` install Vernier Kit, check it, and take it back out.
 */
import { changes as changesWord, describeChanges, TO_APPLY } from "./change-notes";
import { ordinal, propertyName, value } from "./design-values";
import type { Change, Margins, Place } from "./client/changeset";
import { defaultExec, doctor, init, remove, type Exec } from "./install";
import { dirname } from "node:path";
import { BRIEF_UNCHECKED, CHECK_ARRIVE_MS, type CheckAsk, type CheckResult } from "./service-protocol";
import {
  appliedOf,
  archiveRound,
  findProject,
  lastEdited,
  readChangeSet,
  readChecks,
  readLastRound,
  readState,
  snapshotCode,
  vernierFolder,
  writeState,
  type VernierFolder,
} from "./vernier-folder";

export interface Io {
  cwd: string;
  write(text: string): void;
  /** For what went wrong: the command was not run. */
  error(text: string): void;
  /** Runs the package manager and the build, for `init`, `doctor` and `remove`. */
  exec?: Exec;
}

export type { Exec };

/** Runs one command; resolves with the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const [command, ...rest] = args;
  const installIo = { write: io.write, error: io.error, exec: io.exec ?? defaultExec };
  if (command === "init") return init(io.cwd, installIo);
  if (command === "doctor") return doctor(io.cwd, installIo);
  if (command === "remove") return remove(io.cwd, installIo);
  const root = findProject(io.cwd);
  const folder = vernierFolder(root);
  switch (command) {
    case "claim":
      return claim(folder, root, io);
    case "done":
      return done(folder, rest, io);
    case "finish":
      return finish(folder, io);
    case "last":
      return last(folder, root, io);
    default:
      io.error(`Unknown command: ${command ?? "(none)"}\n`);
      return 1;
  }
}

async function claim(folder: VernierFolder, root: string, io: Io): Promise<number> {
  const changeSet = await readChangeSet(folder);
  if (!changeSet?.changes.length) {
    io.write("No design changes to apply: the designer has not changed anything in Vernier Kit since the last round.\n");
    return 0;
  }
  // Claimed already: the Agent may have lost the notes. What it did so far stays done.
  const state = await readState(folder);
  // The code as it was before the Agent changed anything, to undo the round by.
  if (!state) await writeState(folder, { status: "claimed", done: [], claimedAt: new Date().toISOString(), code: await snapshotCode(root) });
  const status = state && ((change: Change) => (state.done.includes(change.id) ? "Done" : "Not done yet"));
  io.write(describeChanges(changeSet.changes, root, status ? { ...TO_APPLY, status } : TO_APPLY));
  return 0;
}

const NOT_CLAIMED = "The round is not claimed: run `npx vernierkit claim` first.\n";

async function done(folder: VernierFolder, args: string[], io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  if (!state || !changeSet) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const wrong = args.find((arg) => !ids.includes(Number(arg)));
  if (!args.length || wrong !== undefined) {
    const which = !args.length ? "Give the numbers of the changes you applied: `npx vernierkit done <number> …`." : `There is no change ${wrong} in this round.`;
    io.error(`${which} Its changes are: ${ids.join(", ")}.\n`);
    return 1;
  }
  const reported = [...new Set(args.map(Number))];
  const changes = reported.map((id) => changeSet.changes.find((c) => c.id === id)!);
  const doneIds = [...new Set([...state.done, ...reported])];
  // A brief has no value to check on the page: what the Agent did is for its report.
  const asked = changes.filter((change) => change.kind !== "brief").map((change) => change.id);
  const check: CheckAsk = { ids: asked, at: new Date().toISOString(), codeAt: await lastEdited(dirname(folder.dir)) };
  const claimed = { ...state, done: doneIds, check };
  await writeState(folder, claimed);
  const results = asked.length ? await waitForChecks(folder, check, state.claimedAt) : new Map<number, CheckResult>();
  const applied = appliedOf(claimed, (await readChecks(folder))?.results);
  const lines = changes.map((change) => checkLine(change, results.get(change.id)));
  const one = changes.length === 1;
  io.write(`${one ? "Change" : "Changes"} ${list(reported)} done: ${applied.length} of ${changesWord(ids.length)} applied.\n`);
  io.write(one ? `${lines[0]}\n` : lines.map((line, i) => `Change ${reported[i]}: ${line[0].toLowerCase()}${line.slice(1)}\n`).join(""));
  return 0;
}

/** `1`, `1 and 2`, `1, 2 and 3`. */
function list(ids: number[]): string {
  return ids.length < 2 ? `${ids[0]}` : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
}

/** What `done` says of a change, as the page checked it. */
function checkLine(change: Change, result: CheckResult | undefined): string {
  if (change.kind === "brief") return `Not checked on the page: ${BRIEF_UNCHECKED}. Say in your report how you achieved it: what you changed, and where.`;
  switch (result?.outcome) {
    case "shown":
      return "Checked on the page: it shows the change.";
    case "not shown":
      return `Checked on the page: it does not show the change. ${notShown(change, result.actual, result.width)}`;
    default:
      return `Not checked on the page: ${result?.reason ?? "the page did not answer in time"}.`;
  }
}

/** What the page shows instead of change `id`, `width` px wide when not as wide as its window, what to look at, and to check again. */
function notShown(change: Change, actual: unknown, width?: number): string {
  const again = `run \`npx vernierkit done ${change.id}\` again`;
  if (change.kind === "delete") {
    if (width) return `At ${width}px wide, the layer is still on the page: take it out at every width, and ${again}.`;
    return `The layer is still on the page: take it out of the code (for a data change, its item out of the data), and ${again}.`;
  }
  if (change.kind === "move") {
    const { absolute, nth } = change.after as Place;
    if (!absolute) return `Its container's layers are in another order on the page: put it ${ordinal(nth)}, as the notes say, and ${again}.`;
    const at = width ? `At ${width}px wide, the` : "The";
    if (actual === "no reference") {
      return `${at} layer is placed absolute, but not from its container: make the container its positioning reference (\`position: relative\`), and ${again}.`;
    }
    if (change.margins && !width && actual) return offByMargins(absolute, change.margins, actual as Placed, again);
    const placed = actual as { x: number; y: number } | null;
    const where = placed ? `at X ${placed.x}px and Y ${placed.y}px` : "not placed absolute";
    return `${at} layer is ${where}, not absolute at X ${absolute.x}px and Y ${absolute.y}px: check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
  }
  if (change.margins && !width && actual !== null && typeof actual === "object") {
    if (change.property === "absolute") return offByMargins(change.after as { x: number; y: number }, change.margins, actual as Placed, again);
    if (change.property === "x" || change.property === "y") return axisOffByMargins(change.property, change.after as number, change.margins, actual as { value: number; margin: number }, again);
  }
  if (width) {
    return (
      `At ${width}px wide, the ${propertyName(change.property)} is ${value(change.property, actual)}, not ${value(change.property, change.after)}. ` +
      `The change applies at every width: see what sets the value at that width (a breakpoint variant such as \`sm:\`, a media query), fix it, and ${again}.`
    );
  }
  return (
    `The ${propertyName(change.property)} is ${value(change.property, actual)}, not ${value(change.property, change.after)}. ` +
    `Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and ${again}.`
  );
}

/** Where the page places an absolute layer: its `left` and `top`, and its left and top margins (`check.ts`). */
type Placed = { x: number; y: number; margins: Margins };

/** Margins in words: `2px left and 6px top`, `24px top`, `none`. */
function marginWords({ x, y }: Margins): string {
  const sides = [x ? `${x}px left` : "", y ? `${y}px top` : ""].filter(Boolean);
  return sides.length ? sides.join(" and ") : "none";
}

/**
 * A layer placed absolute that the page draws elsewhere than the canvas: the
 * canvas draws it past its X and Y (its `left` and `top`) by the margins it
 * keeps, so a `left` and `top` that are right with its margins taken off are not.
 */
function offByMargins(to: { x: number; y: number }, margins: Margins, placed: Placed, again: string): string {
  const drawn = `X ${placed.x + placed.margins.x}px and Y ${placed.y + placed.margins.y}px`;
  const canvas = `X ${to.x + margins.x}px and Y ${to.y + margins.y}px`;
  const text =
    `The layer is drawn at ${drawn} in its container (\`left\` ${placed.x}px and \`top\` ${placed.y}px, margins ${marginWords(placed.margins)}), ` +
    `where the canvas draws it at ${canvas} (its X and Y are its \`left\` and \`top\`, ${to.x}px and ${to.y}px, and it keeps its margins, ${marginWords(margins)}). `;
  if (placed.x === to.x && placed.y === to.y) {
    return `${text}Its \`left\` and \`top\` are right, but not its margins: keep the margins it has on the canvas (what sets them, such as \`mt-6\` or \`margin-top\`), or add them to \`left\` and \`top\`, and ${again}.`;
  }
  return `${text}Check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
}

/** An absolute layer's X or Y the page draws elsewhere than the canvas, which draws it past its `left` or `top` by the margin it keeps. */
function axisOffByMargins(axis: "x" | "y", to: number, margins: Margins, placed: { value: number; margin: number }, again: string): string {
  const [css, side] = axis === "x" ? ["left", "left"] : ["top", "top"];
  const text =
    `The ${propertyName(axis)} is drawn at ${placed.value + placed.margin}px in its container (\`${css}\` ${placed.value}px, ${side} margin ${placed.margin}px), ` +
    `where the canvas draws it at ${to + margins[axis]}px (its ${axis.toUpperCase()} is its \`${css}\`, ${to}px, and it keeps its ${margins[axis]}px ${side} margin). `;
  if (placed.value === to) {
    return `${text}Its \`${css}\` is right, but not its margin: keep the margin it has on the canvas (what sets it, such as \`m${side[0]}-6\` or \`margin-${side}\`), or add it to \`${css}\`, and ${again}.`;
  }
  return `${text}Check its \`position\` and \`${css}\`, and that its container is its positioning reference, then ${again}.`;
}

/**
 * Longest wait for a page's answer: the page's own longest, and some, as a
 * page in a background tab is slow.
 */
const CHECK_WAIT_MS = CHECK_ARRIVE_MS + 6000;
const CHECK_POLL_MS = 50;

/**
 * The open pages' answers to `check`, through the local service's
 * `checks.json`, by change id. A page answers at once for a change it shows
 * already (it looks again, as a later edit may have undone it); with no page
 * to ask, what one saw this round stands. With several pages, one that cannot
 * check (it does not show the layer) does not stand in for one that can and is still at it.
 */
async function waitForChecks(folder: VernierFolder, check: CheckAsk, claimedAt: string | undefined): Promise<Map<number, CheckResult>> {
  const until = Date.now() + CHECK_WAIT_MS;
  const answers = new Map<number, CheckResult>();
  const unchecked = new Map<number, CheckResult>();
  for (;;) {
    const checks = await readChecks(folder);
    const open = !!checks?.pages && isRunning(checks.service);
    for (const id of check.ids) {
      if (answers.has(id)) continue;
      const result = checks?.results[id];
      if (result?.at === check.at) {
        if (result.outcome !== "unchecked" || result.anyPage || checks!.pages === 1) answers.set(id, result);
        else unchecked.set(id, result);
      } else if (!open && result?.outcome === "shown" && (!claimedAt || result.at >= claimedAt)) answers.set(id, result);
    }
    const left = check.ids.filter((id) => !answers.has(id));
    if (!left.length) return answers;
    if (!open) {
      for (const id of left) answers.set(id, { outcome: "unchecked", reason: "no page with Vernier Kit is open" });
      return answers;
    }
    if (Date.now() > until) {
      for (const id of left) answers.set(id, unchecked.get(id) ?? { outcome: "unchecked", reason: "the page did not answer in time" });
      return answers;
    }
    await new Promise((resolve) => setTimeout(resolve, CHECK_POLL_MS));
  }
}

function isRunning(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function finish(folder: VernierFolder, io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  // The round's result is the page's (ADR 0013): it looks at every change it can once more, once the last edit has reached it.
  if (state && changeSet) {
    const ids = changeSet.changes.filter((change) => change.kind !== "brief").map((change) => change.id);
    const closing: CheckAsk = { ids, at: new Date().toISOString(), codeAt: await lastEdited(dirname(folder.dir)) };
    await writeState(folder, { ...state, closing });
    if (ids.length) await waitForChecks(folder, closing, state.claimedAt);
  }
  const result = changeSet && (await archiveRound(folder, "finished"));
  if (!result) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const applied = result.applied ?? result.done;
  const notShown = ids.filter((id) => !applied.includes(id) && result.checks[id]?.outcome === "not shown");
  const missing = ids.filter((id) => !applied.includes(id) && !notShown.includes(id));
  let text = `Round finished: ${applied.length} of ${changesWord(ids.length)} applied.`;
  if (missing.length) text += ` Not marked done: ${missing.join(", ")}. Report why in your reply.`;
  if (notShown.length) text += ` The page does not show: ${notShown.join(", ")}. Report them as not applied 1:1, with why.`;
  io.write(`${text}\n`);
  return 0;
}

async function last(folder: VernierFolder, root: string, io: Io): Promise<number> {
  const round = await readLastRound(folder);
  if (!round) {
    io.write("No earlier round of design changes to undo.\n");
    return 0;
  }
  const { code } = round.result;
  const applied = round.result.applied ?? round.result.done;
  const intro = (count: string) => {
    const text = `${count} from the round before, as the designer asked for them.`;
    if (!code) return `${text} To undo the round, take the applied ones back out of the source; those not applied never went in.`;
    const git = `git -C "${code.repository}"`;
    return (
      `${text} The code changes made while it was applied: \`${git} diff ${code.before} ${code.after}\`. ` +
      `To undo the round, take them back out: \`${git} diff --binary ${code.after} ${code.before} | ${git} apply\`. ` +
      "Check the diff first: anything else edited meanwhile is in it too."
    );
  };
  io.write(
    describeChanges(round.changeSet.changes, root, {
      heading: "Last round of design changes",
      intro,
      status: (change) => (applied.includes(change.id) ? "Applied" : "Not applied"),
    }),
  );
  return 0;
}
