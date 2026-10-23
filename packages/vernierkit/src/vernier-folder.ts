/**
 * The `.vernier/` folder in the project: the round being edited (canvas and
 * ChangeSet), its state while the Agent applies it, and the rounds before it.
 * The local service and the command line both work through this module.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { SavedChangeSet } from "./client/changeset";
import type { CheckResult, CodeSnapshot, RoundStatus } from "./service-protocol";

export const VERNIER_DIR = ".vernier";

export interface VernierFolder {
  dir: string;
  canvas: string;
  changeSet: string;
  /** There while the Agent applies the round. */
  state: string;
  /** One folder per round that ended, named after when it ended. */
  history: string;
  /** Written by the local service: how many pages listen, and how they answered each check. */
  checks: string;
}

/** What `checks.json` holds. */
export interface Checks {
  /** Pages with the editor layer open now: with none, there is no one to check. */
  pages: number;
  /** The latest answer for each change id, and the ask it answers. */
  results: Record<string, CheckResult & { at: string }>;
}

/** A round being edited has no state file; claiming it adds one. */
export type RoundState = Extract<RoundStatus, { status: "claimed" }>;

export function vernierFolder(root: string): VernierFolder {
  const dir = join(root, VERNIER_DIR);
  return { dir, canvas: join(dir, "canvas.html"), changeSet: join(dir, "changeset.json"), state: join(dir, "state.json"), history: join(dir, "history"), checks: join(dir, "checks.json") };
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

/**
 * The round's state; null while it is being edited. A state left behind by a
 * round that is gone (`done` writing it back just after an unlock, say) is
 * cleared: it would keep the designer locked out for good.
 */
export async function readState(folder: VernierFolder): Promise<RoundState | null> {
  const text = await readIfThere(folder.state);
  if (text === null) return null;
  if (!existsSync(folder.changeSet)) {
    await rm(folder.state, { force: true });
    return null;
  }
  return JSON.parse(text) as RoundState;
}

export async function writeState(folder: VernierFolder, state: RoundState) {
  await writeAtomically(folder.state, `${JSON.stringify(state)}\n`);
}

/** How a round ended, archived with its ChangeSet. */
export interface RoundResult {
  /** `finished` by the Agent, or `unlocked` by hand by the designer. */
  ended: "finished" | "unlocked";
  /** The changes applied; the others were not. */
  done: number[];
  /** When, as an ISO date. */
  at: string;
  /** How the page answered the last check of each change. */
  checks: Checks["results"];
  /** In a git repository: the code as the round found it and as it left it. */
  code: { repository: string; before: string; after: string } | null;
}

/**
 * Ends the claimed round: its ChangeSet and result go to the history, the
 * canvas is dropped, and the folder is left with no round. Null when no round
 * is claimed.
 */
export async function archiveRound(folder: VernierFolder, ended: RoundResult["ended"]): Promise<RoundResult | null> {
  const [state, changeSet] = await Promise.all([readState(folder), readIfThere(folder.changeSet)]);
  if (!state || changeSet === null) return null;
  const after = state.code && (await snapshotCode(dirname(folder.dir)));
  const code = state.code && after?.repository === state.code.repository ? { repository: after.repository, before: state.code.tree, after: after.tree } : null;
  const result: RoundResult = { ended, done: state.done, at: new Date().toISOString(), checks: (await readChecks(folder))?.results ?? {}, code };
  const archive = join(folder.history, result.at.replace(/[:.]/g, "-"));
  await mkdir(archive, { recursive: true });
  await writeFile(join(archive, "changeset.json"), changeSet);
  await writeFile(join(archive, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  // The state goes last: once it is gone, the round is over for whoever watches it.
  await rm(folder.changeSet, { force: true });
  await rm(folder.canvas, { force: true });
  await rm(folder.checks, { force: true });
  await rm(folder.state, { force: true });
  return result;
}

export async function readChecks(folder: VernierFolder): Promise<Checks | null> {
  const text = await readIfThere(folder.checks);
  return text === null ? null : (JSON.parse(text) as Checks);
}

export async function writeChecks(folder: VernierFolder, checks: Checks) {
  await writeAtomically(folder.checks, `${JSON.stringify(checks, null, 2)}\n`);
}

/** The round that ended last, as archived; null when none has. */
export async function readLastRound(folder: VernierFolder): Promise<{ changeSet: SavedChangeSet; result: RoundResult } | null> {
  const rounds = await readdir(folder.history).catch(() => []);
  const last = rounds.sort().at(-1);
  if (!last) return null;
  const read = async (file: string) => JSON.parse(await readFile(join(folder.history, last, file), "utf8"));
  return { changeSet: await read("changeset.json"), result: await read("result.json") };
}

/**
 * The project's code as it is now, untracked files included, as a git tree;
 * null outside a git repository. It goes through an index of its own, so
 * what is staged stays as it is.
 */
export async function snapshotCode(root: string): Promise<CodeSnapshot | null> {
  const index = join(tmpdir(), `vernierkit-index-${process.pid}-${Date.now()}`);
  const git = (args: string[], env?: NodeJS.ProcessEnv) => promisify(execFile)("git", args, { cwd: root, env: { ...process.env, ...env } });
  try {
    const { stdout: top } = await git(["rev-parse", "--show-toplevel"]);
    const { stdout: realIndex } = await git(["rev-parse", "--git-path", "index"]);
    // Starting from the real index, git rehashes only the files that changed.
    await copyFile(resolve(root, realIndex.trim()), index).catch(() => {});
    const own = { GIT_INDEX_FILE: index };
    await git(["-C", top.trim(), "add", "--all"], own);
    const { stdout: tree } = await git(["write-tree"], own);
    return { repository: top.trim(), tree: tree.trim() };
  } catch {
    return null; // Not a git repository, or no git.
  } finally {
    await rm(index, { force: true });
  }
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
