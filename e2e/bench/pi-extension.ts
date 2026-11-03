/**
 * The bench's own extension for pi, loaded with `-e` in its runs only (from
 * a copy in the run's folder, with `allowlist.ts` beside it). A fence on the
 * Agent's behaviour, not a sandbox: it blocks the tool calls the bench does
 * not allow, and the Agent reads why. pi has no allowlist of its own for shell
 * commands: every `bash` call the bench's rule turns away is blocked. pi's
 * own tools are held to two path rules: `write` and `edit` stay in the
 * project (the folder pi runs in), and no tool or command reaches pi's own
 * folder (~/.pi), where the designer's login is; reading elsewhere goes
 * ahead, as Claude Code's Read does. A call the extension cannot check is
 * blocked. And pi has no switch for leaving out only the designer's global
 * AGENTS.md: this keeps the instructions files inside the project, as Claude
 * Code's `--setting-sources project,local` does.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DENIED, deniedReason, shellAllowed, shellWords } from "./allowlist.ts";

/** As much of pi's extension API as the bench uses (`@earendil-works/pi-coding-agent`, which the repository does not install). */
interface PiExtensionApi {
  on(event: "tool_call" | "before_agent_start", handler: (event: any, ctx?: any) => unknown): void;
}

/** pi's own tools that work on a path, and those of them that search all below it. */
const PATH_TOOLS = ["read", "grep", "find", "ls", "write", "edit"];
const SEARCHES = ["grep", "find"];
/** The shell commands of the list that can read all below a folder. */
const SHELL_SEARCHES = ["grep", "rg", "find", "git"];

/** A path as the file system has it, so `/var/…` and `/private/var/…` compare alike: the real path of the nearest folder there is, and the rest. */
function realPath(path: string): string {
  const rest: string[] = [];
  for (let dir = path; ; dir = dirname(dir)) {
    try {
      return join(realpathSync(dir), ...rest);
    } catch {
      if (dirname(dir) === dir) return path;
      rest.unshift(basename(dir));
    }
  }
}

/** A path given to one of pi's tools, made absolute as pi does: an @ before it dropped, ~ for the home folder, a file:// URL. */
function toolPath(path: unknown, cwd: string): string {
  if (path === undefined) return cwd;
  if (typeof path !== "string") throw new Error("A path that is no string");
  const given = path.replace(/^@/, "");
  if (/^file:\/\//.test(given)) return resolve(fileURLToPath(given));
  return resolve(cwd, withHome(given));
}

/** `~` and `~/…` as the home folder, `~name/…` as that user's, beside it. */
function withHome(path: string): string {
  if (path === "~" || path.startsWith("~/")) return homedir() + path.slice(1);
  return path.startsWith("~") ? join(dirname(homedir()), path.slice(1)) : path;
}

/** pi's own folder, as written and as the file system has it. */
const piFolders = () => [join(homedir(), ".pi"), realPath(join(homedir(), ".pi"))];

/**
 * Whether `path`, a pattern bash may fill in, names something in pi's folder,
 * or (with `above`) a folder above it, which a search reads all of. Compared
 * part by part, in any case (as macOS finds names): `*`, `?` and `[…]` match
 * as in bash, a dot first only by a dot.
 */
function reachesPi(path: string, above: boolean): boolean {
  const parts = (p: string) => p.split(sep).filter(Boolean);
  return [path, realPath(path)].some((candidate) =>
    piFolders().some((folder) => {
      const want = parts(folder);
      const have = parts(candidate);
      const n = Math.min(want.length, have.length);
      if (!have.slice(0, n).every((part, i) => partMatches(part, want[i]))) return false;
      return have.length >= want.length || above;
    }),
  );
}

function partMatches(pattern: string, name: string): boolean {
  if (!/[*?[]/.test(pattern)) return pattern.toLowerCase() === name.toLowerCase();
  if (name.startsWith(".") && !pattern.startsWith(".")) return false;
  const source = pattern.replace(/\[!?[^\]]*\]|[*?]|[^*?[]+|\[/g, (piece) => {
    if (piece === "*") return ".*";
    if (piece === "?") return ".";
    if (piece.startsWith("[") && piece.length > 1) return `[${piece.slice(1, -1).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
    return piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${source}$`, "i").test(name);
}

/** Whether a command line the rule allows has an argument that names pi's folder (or, for a search, a folder above it), its `cd`s followed. */
function shellReachesPi(command: string, cwd: string): boolean {
  let here = cwd;
  let before = cwd;
  for (const words of shellWords(command) ?? []) {
    if (words.some((word) => /(^|\/)\.pi(\/|$)/i.test(word))) return true;
    const searches = SHELL_SEARCHES.includes(words[0]);
    if (words.slice(1).some((word) => !word.startsWith("-") && reachesPi(resolve(here, withHome(word)), searches))) return true;
    if (words[0] === "cd") {
      const to = words[1] === undefined ? homedir() : words[1] === "-" ? before : resolve(here, withHome(words[1]));
      before = here;
      here = to;
    }
  }
  return false;
}

function check(event: { toolName: string; input: Record<string, unknown> }, cwd: string): { block: true; reason: string } | undefined {
  const { toolName, input } = event;
  const block = (reason: string) => ({ block: true as const, reason });
  const intoPi = (what: string) => block(`${DENIED} no tool or command in pi's own folder (~/.pi), where the designer's login is, or a search over a folder above it. Turned away: ${what}`);
  if (toolName === "bash") {
    const command = String(input.command ?? "");
    if (!shellAllowed(command)) return block(deniedReason(command));
    return shellReachesPi(command, cwd) ? intoPi(command) : undefined;
  }
  if (!PATH_TOOLS.includes(toolName)) return undefined;
  const path = toolPath(input.path, cwd);
  if (reachesPi(path, SEARCHES.includes(toolName))) return intoPi(`${toolName} ${input.path ?? "."}`);
  if ((toolName === "write" || toolName === "edit") && !realPath(path).startsWith(realPath(cwd) + sep)) {
    return block(`${DENIED} writing in the project only. Turned away: ${toolName} ${input.path}`);
  }
  return undefined;
}

/** Whether a file is in the project: by the real path of its folder, as pi finds them, so the project's own AGENTS.md, linked from elsewhere, is. */
function inProject(file: { path: string }, project: string): boolean {
  try {
    const folder = realpathSync(dirname(file.path));
    return folder === project || folder.startsWith(project + sep);
  } catch {
    return false;
  }
}

export default function benchExtension(pi: PiExtensionApi) {
  pi.on("tool_call", (event: { toolName: string; input: Record<string, unknown> }, ctx?: { cwd?: string }) => {
    try {
      return check(event, ctx?.cwd ?? process.cwd());
    } catch {
      return { block: true, reason: `${DENIED} only the tool calls it can check. Turned away: ${event?.toolName}` };
    }
  });
  pi.on("before_agent_start", (event: { systemPromptOptions: { cwd: string; contextFiles: { path: string }[] } }) => {
    const options = event.systemPromptOptions;
    try {
      const project = realpathSync(options.cwd);
      options.contextFiles = options.contextFiles.filter((file) => inProject(file, project));
    } catch {
      options.contextFiles = [];
    }
  });
}
