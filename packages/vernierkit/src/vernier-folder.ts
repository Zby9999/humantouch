/**
 * The `.vernier/` folder in the project: the round being edited (canvas and
 * ChangeSet), its state while the Agent applies it, and the rounds before it.
 * The local service and the command line both work through this module.
 */
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SavedChangeSet } from "./client/changeset";

export const VERNIER_DIR = ".vernier";

export interface VernierFolder {
  dir: string;
  canvas: string;
  changeSet: string;
  /** There while the Agent applies the round. */
  state: string;
}

/** A round being edited has no state file; claiming it adds one. */
export interface RoundState {
  status: "claimed";
  /** Ids of the changes the Agent has applied so far. */
  done: number[];
}

export function vernierFolder(root: string): VernierFolder {
  const dir = join(root, VERNIER_DIR);
  return { dir, canvas: join(dir, "canvas.html"), changeSet: join(dir, "changeset.json"), state: join(dir, "state.json") };
}

/** The project a command runs for: the nearest folder up from `cwd` with a `.vernier/`, else `cwd` itself. */
export function findProject(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, VERNIER_DIR))) return dir;
    if (dirname(dir) === dir) return cwd;
  }
}

/** The ChangeSet of the round, or null when there is no round. */
export async function readChangeSet(folder: VernierFolder): Promise<SavedChangeSet | null> {
  const text = await readIfThere(folder.changeSet);
  return text === null ? null : (JSON.parse(text) as SavedChangeSet);
}

/** The round's state; null while it is being edited. */
export async function readState(folder: VernierFolder): Promise<RoundState | null> {
  const text = await readIfThere(folder.state);
  return text === null ? null : (JSON.parse(text) as RoundState);
}

export async function writeState(folder: VernierFolder, state: RoundState) {
  await writeAtomically(folder.state, `${JSON.stringify(state)}\n`);
}

export async function readIfThere(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Written in full or not at all: a reader never sees half a file. */
export async function writeAtomically(file: string, text: string) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}
