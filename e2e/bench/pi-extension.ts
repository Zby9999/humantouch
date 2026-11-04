/**
 * The bench's own extension for pi, loaded with `-e` in its runs only (from
 * a copy in the run's folder, with `allowlist.ts` beside it). A fence on the
 * Agent's behaviour, not a sandbox: it blocks the tool calls the bench does
 * not allow, and the Agent reads why. pi has no allowlist of its own for shell
 * commands: every `bash` call the bench's rule turns away is blocked, and
 * any that cds out of the project. pi's
 * own tools are held to two path rules: `write` and `edit` stay in the
 * project (the folder pi runs in), and no tool or command reaches pi's own
 * folder (~/.pi), where the designer's login is; reading elsewhere goes
 * ahead, as Claude Code's Read does. A call the extension cannot check is
 * blocked. And pi has no switch for leaving out only the designer's global
 * AGENTS.md: this keeps the instructions files inside the project, as Claude
 * Code's `--setting-sources project,local` does.
 *
 * The install bench (ticket 91) writes `install-list.json` beside the copy:
 * then the shell commands allowed are its `shell` in place of the applying
 * bench's, one of its `servers` may start a dev server in the background
 * (allowlist.ts, backgroundServer), and a runner of its `runners` (`npx`,
 * `pnpm exec`…) may run only the programs listed for it, past only its
 * `flags`, and no word may be one of its `options` (allowlist.ts,
 * runsAllowed). With no such file, nothing changes.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backgroundServer, DENIED, deniedReason, runsAllowed, SHELL, shellAllowed, shellWords } from "./allowlist.ts";

/** As much of pi's extension API as the bench uses (`@earendil-works/pi-coding-agent`, which the repository does not install). */
interface PiExtensionApi {
  on(event: "tool_call" | "before_agent_start", handler: (event: any, ctx?: any) => unknown): void;
}

/** The file the install bench writes beside the extension's copy, and what it holds. */
export const INSTALL_LIST = "install-list.json";
export interface ShellList {
  shell: readonly string[];
  servers: readonly string[];
  runners: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  options: readonly string[];
}

/** The applying bench's list, or the install bench's when `file` is there. */
function shellList(file: string): ShellList {
  if (!existsSync(file)) return { shell: SHELL, servers: [], runners: {}, flags: [], options: [] };
  const list = JSON.parse(readFileSync(file, "utf8"));
  for (const key of ["shell", "servers", "flags", "options"]) if (!Array.isArray(list[key])) throw new Error(`${file} has no ${key} list`);
  if (typeof list.runners !== "object" || !Object.values(list.runners).every(Array.isArray)) throw new Error(`${file} has no runners`);
  return list;
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

/** Options of grep and rg whose next word is their value, not a pattern or a path (grep's -r is recursive; rg's, a replacement). */
const TAKES_VALUE: Record<string, RegExp> = {
  grep: /^(-[ABCmdD]|--(context|after-context|before-context|max-count|directories|devices|include|exclude|exclude-dir))$/,
  rg: /^(-[ABCmgtTMjEr]|--(context|after-context|before-context|max-count|glob|iglob|type|type-not|max-columns|threads|encoding|replace))$/,
};

/**
 * The words of a command bash passes that may be paths: all but options (and
 * their values, for grep and rg), and for grep and rg not the pattern, the
 * first such word, unless `-e` or `-f` gives the pattern, when every one is a
 * path; and `-f`'s file is one.
 */
function pathWords(words: string[]): string[] {
  const takesValue = TAKES_VALUE[words[0]];
  const paths: string[] = [];
  let patternGiven = false;
  let next: "value" | "file" | null = null;
  for (const word of words.slice(1)) {
    if (next) {
      if (next === "file") paths.push(word);
      next = null;
      continue;
    }
    if (!word.startsWith("-")) paths.push(word);
    else if (takesValue) {
      // -e and -f, alone or last in a bunch of short ones, take the next word; with a value of their own (`-e/`, `--file=x`), it is in the word.
      const pattern = /^(?:-[a-zA-Z]*e(.*)|--regexp(?:=(.*))?)$/.exec(word);
      const file = /^(?:-[a-zA-Z]*f(.*)|--file(?:=(.*))?)$/.exec(word);
      if (file) {
        patternGiven = true;
        const value = file[1] || file[2];
        if (value) paths.push(value);
        else next = "file";
      } else if (pattern) {
        patternGiven = true;
        if (!(pattern[1] || pattern[2])) next = "value";
      } else if (takesValue.test(word)) next = "value";
    }
  }
  return takesValue && !patternGiven ? paths.slice(1) : paths;
}

/**
 * Whether a command line the rule allows reaches out: an argument that names
 * pi's folder (or, for a search, a folder above it), or a `cd` out of the
 * project, `cd`s followed by the real path of their folder.
 */
function shellReaches(command: string, cwd: string): "pi" | "out" | null {
  const project = realPath(cwd);
  let here = cwd;
  for (const words of shellWords(command) ?? []) {
    if (words.some((word) => /(^|\/)\.pi(\/|$)/i.test(word))) return "pi";
    const searches = SHELL_SEARCHES.includes(words[0]);
    if (pathWords(words).some((word) => reachesPi(resolve(here, withHome(word)), searches))) return "pi";
    if (words[0] === "cd") {
      // The rule lets a cd have one folder only.
      here = realPath(resolve(here, withHome(words[1] ?? "")));
      if (here !== project && !here.startsWith(project + sep)) return "out";
    }
  }
  return null;
}

function check(event: { toolName: string; input: Record<string, unknown> }, cwd: string, list: ShellList): { block: true; reason: string } | undefined {
  const { toolName, input } = event;
  const block = (reason: string) => ({ block: true as const, reason });
  const intoPi = (what: string) => block(`${DENIED} no tool or command in pi's own folder (~/.pi), where the designer's login is, or a search over a folder above it. Turned away: ${what}`);
  if (toolName === "bash") {
    const command = String(input.command ?? "");
    const denied = () => block(deniedReason(command, list.shell, list.servers));
    const inProject = (path: string) => realPath(resolve(cwd, path)).startsWith(realPath(cwd) + sep);
    // A dev server in the background is checked as the command it runs, the paths in it too.
    const checked = shellAllowed(command, list.shell) ? command : backgroundServer(command, list.servers, inProject);
    if (checked === null) return denied();
    if (!(shellWords(checked) ?? []).every((words) => runsAllowed(words, list.runners, list.flags, list.options))) {
      const runners = Object.entries(list.runners).map(([runner, programs]) => `${runner} ${programs.join("|")}`);
      return block(`${DENIED} npx and the like to run only these (${runners.join("; ")}), 03kind by a version or a packed file too, with no option before the program but ${list.flags.join(" ")}, and no ${list.options.join(", ")} anywhere. Turned away: ${command}`);
    }
    const reaches = shellReaches(checked, cwd);
    if (reaches === "out") return denied();
    return reaches === "pi" ? intoPi(command) : undefined;
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

/** pi calls it with its API alone; `listFile` is for the tests. A list there that cannot be read blocks every tool call. */
export default function benchExtension(pi: PiExtensionApi, listFile = join(dirname(fileURLToPath(import.meta.url)), INSTALL_LIST)) {
  let list: ShellList | null;
  try {
    list = shellList(listFile);
  } catch {
    list = null;
  }
  pi.on("tool_call", (event: { toolName: string; input: Record<string, unknown> }, ctx?: { cwd?: string }) => {
    try {
      if (!list) throw new Error("No list");
      return check(event, ctx?.cwd ?? process.cwd(), list);
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
