/**
 * The `.vernier/` folder in the project: the round being edited (canvas and
 * ChangeSet), its state while the Agent applies it, the rounds before it, and
 * the layers off the canvas, which belong to no round (ADR 0009).
 * The local service and the command line both work through this module.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { carryOver, type SavedChangeSet } from "./client/changeset";
import type { CheckAsk, CheckResult, CodeSnapshot, SavedOffCanvasLayer, RoundStatus } from "./service-protocol";

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
  /** The layers off the canvas: no round's, so no round's end takes them (ADR 0009). */
  offCanvas: string;
}

/** What `checks.json` holds. */
export interface Checks {
  /** Pages with the editor layer open now: with none, there is no one to check. */
  pages: number;
  /** The process of the local service that counts them: once it is gone, so are they. */
  service: number;
  /** The latest word from a page on each change id: when it checked, and the key of the ask it answers, if it answers one. */
  results: Record<string, CheckResult & { at: string; answers?: string }>;
}

/**
 * A round being edited has no state file; claiming it adds one: the changes
 * the Agent reported done, the check `done` asks for last, and what only the
 * command line needs: when the round was claimed, and the code as it was then.
 */
export interface RoundState {
  status: "claimed";
  done: number[];
  /** What `claim` asks the page of the changes carried over from the round before (ticket 68): what it shows now. */
  opening?: CheckAsk;
  check?: CheckAsk;
  /** What `finish` asks the page before it ends the round: apart from `done`'s, which tells the Agent's progress. */
  closing?: CheckAsk;
  claimedAt?: string;
  code?: CodeSnapshot | null;
}

/**
 * The changes that count as applied (ADR 0013): those the page shows, done or
 * not, and those the Agent reported done that it does not say it does not
 * show (it cannot check them, or no page is open). Of `results`, only this
 * round's count: an earlier round's may have been written back after it ended.
 */
export function appliedOf(state: RoundState, results: Checks["results"] = {}): number[] {
  const own = (id: string | number) => {
    const result = results[id];
    return result && (!state.claimedAt || result.at >= state.claimedAt) ? result : undefined;
  };
  const shown = Object.keys(results).map(Number).filter((id) => own(id)?.outcome === "shown");
  const done = state.done.filter((id) => own(id)?.outcome !== "not shown");
  return [...new Set([...shown, ...done])].sort((a, b) => a - b);
}

/** How the round stands, as the editor layer is told. */
export async function roundStatus(folder: VernierFolder): Promise<RoundStatus> {
  const state = await readState(folder);
  if (!state) return { status: "editing" };
  const applied = appliedOf(state, (await readChecks(folder))?.results);
  return {
    status: "claimed",
    done: state.done,
    applied,
    ...(state.opening && { opening: state.opening }),
    ...(state.check && { check: state.check }),
    ...(state.closing && { closing: state.closing }),
  };
}

export function vernierFolder(root: string): VernierFolder {
  const dir = join(root, VERNIER_DIR);
  return { dir, canvas: join(dir, "canvas.html"), changeSet: join(dir, "changeset.json"), state: join(dir, "state.json"), history: join(dir, "history"), checks: join(dir, "checks.json"), offCanvas: join(dir, "off-canvas.json") };
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
  /** The changes the Agent reported done. */
  done: number[];
  /** The changes applied, as the page shows them (`appliedOf`); the others were not. Missing in rounds archived before ticket 64: `done` then. */
  applied?: number[];
  /** When, as an ISO date. */
  at: string;
  /** How the page answered the last check of each change. */
  checks: Checks["results"];
  /** In a git repository: the code as the round found it and as it left it. */
  code: { repository: string; before: string; after: string } | null;
}

/**
 * Ends the claimed round: its ChangeSet and result go to the history. With
 * every change applied, the canvas is dropped and the folder is left with no
 * round: edit mode freezes the page afresh. With changes not applied, they
 * are carried over (ticket 68): the canvas stays, and the round is those
 * changes (`carryOver`). Null when no round is claimed.
 */
export async function archiveRound(folder: VernierFolder, ended: RoundResult["ended"]): Promise<RoundResult | null> {
  const [state, changeSet] = await Promise.all([readState(folder), readIfThere(folder.changeSet)]);
  if (!state || changeSet === null) return null;
  const after = state.code && (await snapshotCode(dirname(folder.dir)));
  const code = state.code && after?.repository === state.code.repository ? { repository: after.repository, before: state.code.tree, after: after.tree } : null;
  // Only this round's checks: an earlier round's could have been written back after it ended.
  const results = Object.entries((await readChecks(folder))?.results ?? {}).filter(([, r]) => !state.claimedAt || r.at >= state.claimedAt);
  const checks = Object.fromEntries(results);
  const result: RoundResult = { ended, done: state.done, applied: appliedOf(state, checks), at: new Date().toISOString(), checks, code };
  const archive = join(folder.history, result.at.replace(/[:.]/g, "-"));
  await mkdir(archive, { recursive: true });
  // The round's own changes: what the rounds before applied, carried along with it for the canvas, is theirs.
  const saved = JSON.parse(changeSet) as SavedChangeSet;
  const { applied: _before, ...own } = saved;
  await writeFile(join(archive, "changeset.json"), saved.applied ? `${JSON.stringify(own, null, 2)}\n` : changeSet);
  await writeFile(join(archive, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  // The state goes last: once it is gone, the round is over for whoever watches it.
  const next = carryOver(saved, result.applied!);
  if (next) {
    await writeAtomically(folder.changeSet, `${JSON.stringify(next, null, 2)}\n`);
    // The pages open still, with no checks: the next claim asks them what they show of what is left.
    const open = await readChecks(folder);
    if (open) await writeChecks(folder, { ...open, results: {} });
  } else {
    await rm(folder.changeSet, { force: true });
    await rm(folder.canvas, { force: true });
    await rm(folder.checks, { force: true });
  }
  await rm(folder.state, { force: true });
  return result;
}

/** The layers off the canvas; none when there are none. */
export async function readOffCanvas(folder: VernierFolder): Promise<SavedOffCanvasLayer[]> {
  const text = await readIfThere(folder.offCanvas);
  return text === null ? [] : (JSON.parse(text) as { layers: SavedOffCanvasLayer[] }).layers;
}

/** Keeps the layers off the canvas; with none, nothing is kept. */
export async function writeOffCanvas(folder: VernierFolder, layers: SavedOffCanvasLayer[]) {
  if (!layers.length) return rm(folder.offCanvas, { force: true });
  await mkdir(folder.dir, { recursive: true });
  await writeAtomically(folder.offCanvas, `${JSON.stringify({ layers }, null, 2)}\n`);
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
    // `.vernier/` itself is no code of the round, ignored or not.
    await git(["-C", top.trim(), "add", "--all", "--", ".", ":(exclude,glob)**/.vernier/**"], own);
    const { stdout: tree } = await git(["write-tree"], own);
    return { repository: top.trim(), tree: tree.trim() };
  } catch {
    return null; // Not a git repository, or no git.
  } finally {
    await rm(index, { force: true });
  }
}

/**
 * When the project's code was last edited, as ms since the epoch: the latest
 * of the times the files git sees changed were written (`.vernier/` aside).
 * Null outside a git repository, or with no file changed.
 */
export async function lastEdited(root: string): Promise<number | null> {
  const git = (args: string[]) => promisify(execFile)("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  try {
    const { stdout: top } = await git(["rev-parse", "--show-toplevel"]);
    const { stdout } = await git(["status", "--porcelain=v1", "-z", "-uall", "--", "."]);
    const entries = stdout.split("\0");
    const paths: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 4) continue;
      // A rename or copy: the path it came from follows.
      if (/^[RC]/.test(entry)) i++;
      if (entry[0] === "D" || entry[1] === "D") continue;
      paths.push(entry.slice(3));
    }
    const times = await Promise.all(
      paths
        .filter((path) => !/(^|\/)\.vernier\//.test(path))
        .map((path) => stat(join(top.trim(), path)).then((info) => info.mtimeMs, () => stat(join(root, path)).then((info) => info.mtimeMs, () => 0))),
    );
    const latest = Math.max(0, ...times);
    return latest ? Math.floor(latest) : null;
  } catch {
    return null; // Not a git repository, or no git.
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
