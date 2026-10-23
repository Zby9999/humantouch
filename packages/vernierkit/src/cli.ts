/**
 * The command line, run by the Agent: `claim` takes the round to apply and
 * prints the change notes, written for the Agent.
 */
import { describeChanges } from "./change-notes";
import { findProject, readChangeSet, vernierFolder, writeState } from "./vernier-folder";

export interface Io {
  cwd: string;
  write(text: string): void;
}

/** Runs one command; resolves with the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const [command] = args;
  const folder = vernierFolder(findProject(io.cwd));
  switch (command) {
    case "claim": {
      const changeSet = await readChangeSet(folder);
      if (!changeSet?.changes.length) {
        io.write("No design changes to apply: the designer has not changed anything in Vernier Kit since the last round.\n");
        return 0;
      }
      await writeState(folder, { status: "claimed", done: [] });
      io.write(describeChanges(changeSet.changes));
      return 0;
    }
    default:
      io.write(`Unknown command: ${command ?? "(none)"}\n`);
      return 1;
  }
}
