/**
 * The command line, run by the Agent as the Skill tells it: `claim` takes the
 * round to apply and prints the change notes, `done <number>` reports each
 * change applied and has the page check it, `finish` ends the round, and
 * `last` prints the round before, to undo it by.
 */
import { changes, describeChanges, TO_APPLY } from "./change-notes";
import { ordinal, propertyName, value } from "./design-values";
import type { Change, Place } from "./client/changeset";
import { CHECK_SETTLE_MS, type CheckAsk, type CheckResult } from "./service-protocol";
import {
  archiveRound,
  findProject,
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
}

/** Runs one command; resolves with the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const [command, ...rest] = args;
  const root = findProject(io.cwd);
  const folder = vernierFolder(root);
  switch (command) {
    case "claim":
      return claim(folder, root, io);
    case "done":
      return done(folder, rest[0], io);
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

async function done(folder: VernierFolder, arg: string | undefined, io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  if (!state || !changeSet) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const id = Number(arg);
  if (!ids.includes(id)) {
    const which = arg === undefined ? "Give the number of the change you applied: `npx vernierkit done <number>`." : `There is no change ${arg} in this round.`;
    io.error(`${which} Its changes are: ${ids.join(", ")}.\n`);
    return 1;
  }
  const doneIds = state.done.includes(id) ? state.done : [...state.done, id];
  const check = { id, at: new Date().toISOString() };
  await writeState(folder, { ...state, done: doneIds, check });
  io.write(`Change ${id} done: ${doneIds.length} of ${changes(ids.length)} applied.\n`);
  const change = changeSet.changes.find((c) => c.id === id)!;
  const result = await waitForCheck(folder, check);
  switch (result.outcome) {
    case "shown":
      io.write("Checked on the page: it shows the change.\n");
      break;
    case "not shown":
      io.write(`Checked on the page: it does not show the change. ${notShown(change, result.actual)}\n`);
      break;
    case "unchecked":
      io.write(`Not checked on the page: ${result.reason}.\n`);
  }
  return 0;
}

/** What the page shows instead of change `id`, what to look at, and to check again. */
function notShown(change: Change, actual: unknown): string {
  const again = `run \`npx vernierkit done ${change.id}\` again`;
  if (change.kind === "delete") return `The layer is still on the page: take it out of the code (for a data change, its item out of the data), and ${again}.`;
  if (change.kind === "move") {
    const { absolute, nth } = change.after as Place;
    if (!absolute) return `Its container's layers are in another order on the page: put it ${ordinal(nth)}, as the notes say, and ${again}.`;
    const at = actual as { x: number; y: number } | null;
    const where = at ? `at X ${at.x}px and Y ${at.y}px` : "not placed absolute";
    return `The layer is ${where}, not absolute at X ${absolute.x}px and Y ${absolute.y}px: check its \`position\`, \`left\` and \`top\`, and that its container is its positioning reference, then ${again}.`;
  }
  return (
    `The ${propertyName(change.property)} is ${value(change.property, actual)}, not ${value(change.property, change.after)}. ` +
    `Something overrides your change: see what sets the value in the notes (Currently set by), fix it, and ${again}.`
  );
}

/** Longest wait for a page's answer: the page waits for the dev server itself, and a page in a background tab is slow. */
const CHECK_WAIT_MS = CHECK_SETTLE_MS + 3000;
const CHECK_POLL_MS = 50;

/**
 * The open pages' answer to `check`, through the local service's
 * `checks.json`. With several pages, one that cannot check (it does not show
 * the layer) does not stand in for one that can and is still at it.
 */
async function waitForCheck(folder: VernierFolder, check: CheckAsk): Promise<CheckResult> {
  const until = Date.now() + CHECK_WAIT_MS;
  let unchecked: CheckResult | null = null;
  for (;;) {
    const checks = await readChecks(folder);
    if (!checks?.pages || !isRunning(checks.service)) return { outcome: "unchecked", reason: "no page with Vernier Kit is open" };
    const result = checks.results[check.id];
    if (result?.at === check.at) {
      if (result.outcome !== "unchecked" || checks.pages === 1) return result;
      unchecked = result;
    }
    if (Date.now() > until) return unchecked ?? { outcome: "unchecked", reason: "the page did not answer in time" };
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
  const changeSet = await readChangeSet(folder);
  const result = changeSet && (await archiveRound(folder, "finished"));
  if (!result) {
    io.error(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const missing = ids.filter((id) => !result.done.includes(id));
  const notShown = result.done.filter((id) => result.checks[id]?.outcome === "not shown");
  let text = `Round finished: ${result.done.length} of ${changes(ids.length)} applied.`;
  if (missing.length) text += ` Not marked done: ${missing.join(", ")}. Report why in your reply.`;
  if (notShown.length) text += ` The page did not show: ${notShown.join(", ")}. Report them as not applied 1:1, with why.`;
  io.write(`${text}\n`);
  return 0;
}

async function last(folder: VernierFolder, root: string, io: Io): Promise<number> {
  const round = await readLastRound(folder);
  if (!round) {
    io.write("No earlier round of design changes to undo.\n");
    return 0;
  }
  const { done, code } = round.result;
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
      status: (change) => (done.includes(change.id) ? "Applied" : "Not applied"),
    }),
  );
  return 0;
}
