/**
 * The command line, run by the Agent as the Skill tells it: `claim` takes the
 * round to apply and prints the change notes, `done <number>` reports each
 * change applied, `finish` ends the round, and `last` prints the round before,
 * to undo it by.
 */
import { changes, describeChanges, TO_APPLY } from "./change-notes";
import type { Change } from "./client/changeset";
import {
  archiveRound,
  findProject,
  readChangeSet,
  readLastRound,
  readState,
  vernierFolder,
  writeState,
  type VernierFolder,
} from "./vernier-folder";

export interface Io {
  cwd: string;
  write(text: string): void;
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
      io.write(`Unknown command: ${command ?? "(none)"}\n`);
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
  if (!state) await writeState(folder, { status: "claimed", done: [] });
  const status = state && ((change: Change) => (state.done.includes(change.id) ? "Done" : "Not done yet"));
  io.write(describeChanges(changeSet.changes, root, status ? { ...TO_APPLY, status } : TO_APPLY));
  return 0;
}

const NOT_CLAIMED = "The round is not claimed: run `npx vernierkit claim` first.\n";

async function done(folder: VernierFolder, arg: string | undefined, io: Io): Promise<number> {
  const [state, changeSet] = await Promise.all([readState(folder), readChangeSet(folder)]);
  if (!state || !changeSet) {
    io.write(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const id = Number(arg);
  if (!ids.includes(id)) {
    const which = arg === undefined ? "Give the number of the change you applied: `npx vernierkit done <number>`." : `There is no change ${arg} in this round.`;
    io.write(`${which} Its changes are: ${ids.join(", ")}.\n`);
    return 1;
  }
  const doneIds = state.done.includes(id) ? state.done : [...state.done, id];
  await writeState(folder, { ...state, done: doneIds });
  io.write(`Change ${id} done: ${doneIds.length} of ${changes(ids.length)} applied.\n`);
  return 0;
}

async function finish(folder: VernierFolder, io: Io): Promise<number> {
  const changeSet = await readChangeSet(folder);
  const result = changeSet && (await archiveRound(folder, "finished"));
  if (!result) {
    io.write(NOT_CLAIMED);
    return 1;
  }
  const ids = changeSet.changes.map((change) => change.id);
  const missing = ids.filter((id) => !result.done.includes(id));
  let text = `Round finished: ${result.done.length} of ${changes(ids.length)} applied.`;
  if (missing.length) text += ` Not marked done: ${missing.join(", ")}. Report why in your reply.`;
  io.write(`${text}\n`);
  return 0;
}

async function last(folder: VernierFolder, root: string, io: Io): Promise<number> {
  const round = await readLastRound(folder);
  if (!round) {
    io.write("No earlier round of design changes to undo.\n");
    return 0;
  }
  const { done } = round.result;
  io.write(
    describeChanges(round.changeSet.changes, root, {
      heading: "Last round of design changes",
      intro: (count) =>
        `${count} from the round before, as the designer asked for them. To undo the round, take the applied ones back out of the source; those not applied never went in.`,
      status: (change) => (done.includes(change.id) ? "Applied" : "Not applied"),
    }),
  );
  return 0;
}
