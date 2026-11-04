/**
 * The Agents the bench runs, each by one command line, fixed here: the
 * numbers of two rounds compare only when both ran the same one (docs/goals.md,
 * Measuring). Each runs unattended in the run's project, on the model its
 * arguments pin, in an environment with nothing of the shell it was started
 * from (no gateway, no model setting), as the designer's own login.
 * TK_BENCH_CLAUDE, TK_BENCH_CURSOR and TK_BENCH_PI name another binary; TK_BENCH_CURSOR_MODEL
 * another id of Cursor's model, which must name the same model (its command
 * line, in meta.json, shows the id; a run on another model stops the bench).
 */
import { execFile, spawn } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { EXACT, realPath, SHELL } from "./allowlist.ts";
import type { AgentName } from "./metrics.ts";

const execFileAsync = promisify(execFile);

/** What the designer says to the Agent: the Skill's own trigger. */
export const PROMPT = "落地我的设计改动";
/** What the Agent is told in a project with no Skill (ticket 65): only to run `claim` and apply as it says. */
export const NO_SKILL_PROMPT = "运行 `npx 03kind claim`，照输出落地";

/** All the PATH the Agent's shell gets: Cursor's install, Node's (for `npx`), then the system's. */
const PATH = [join(homedir(), ".local/bin"), dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

/**
 * The environment an Agent runs in: these and nothing else. Of the bench's
 * own, only who the user is and how the machine reaches the network (the
 * designer's proxy, when their shell sets one): no API keys, base URLs or
 * model settings.
 */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: homedir(), PATH: PATH.join(delimiter), LANG: "en_US.UTF-8", TERM: "xterm-256color", TMPDIR: tmpdir() };
  for (const name of ["USER", "LOGNAME", "SHELL", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"]) if (process.env[name]) env[name] = process.env[name];
  return env;
}

/** The binary `name` on the Agent's PATH. */
function onPath(name: string): string {
  const found = PATH.map((dir) => join(dir, name)).find((path) => existsSync(path));
  if (!found) throw new Error(`No ${name} on ${PATH.join(delimiter)}`);
  return found;
}

/** The agent-cli the Cursor app runs its Agent with: a link to its current version. */
const CURSOR_APP_AGENT = join(homedir(), "Library/Application Support/Cursor/User/globalStorage/anysphere.cursor-agent-worker/agent-cli/.local/bin/cursor-agent");

/** Where the Claude desktop app keeps the Claude Code it ships, one folder per version. */
const DESKTOP_CLAUDE_CODE = join(homedir(), "Library/Application Support/Claude/claude-code");

/** The Claude Code the desktop app ships, its newest version: `<version>/<hash>/claude.app/Contents/MacOS/claude`. */
function desktopClaudeCode(): string {
  const newer = (a: string, b: string) => b.split(".").map(Number).reduce((order, part, i) => order || part - Number(a.split(".")[i] ?? 0), 0);
  const versions = existsSync(DESKTOP_CLAUDE_CODE) ? readdirSync(DESKTOP_CLAUDE_CODE).filter((name) => /^\d+(\.\d+)*$/.test(name)).sort(newer) : [];
  for (const version of versions) {
    for (const hash of readdirSync(join(DESKTOP_CLAUDE_CODE, version))) {
      const binary = join(DESKTOP_CLAUDE_CODE, version, hash, "claude.app/Contents/MacOS/claude");
      if (existsSync(binary)) return binary;
    }
  }
  throw new Error(`No Claude Code of the desktop app in ${DESKTOP_CLAUDE_CODE}: name one with TK_BENCH_CLAUDE`);
}

/**
 * Playwright's headless shell, for the Agent's own browsers: the one
 * TK_BENCH_HEADLESS_SHELL names, else the one installed beside the Chromium
 * the repository's Playwright launches. Null when there is none.
 */
export function headlessShell(env: NodeJS.ProcessEnv = process.env, chromiumPath = chromium.executablePath()): string | null {
  const named = env.TK_BENCH_HEADLESS_SHELL;
  if (named) return existsSync(named) ? named : null;
  // `<browsers>/chromium-<revision>/…` beside `<browsers>/chromium_headless_shell-<revision>/chrome-headless-shell-<platform>/chrome-headless-shell`.
  const [, browsers, revision] = /^(.*)[/\\]chromium-(\d+)[/\\]/.exec(chromiumPath) ?? [];
  const folder = join(browsers ?? "", `chromium_headless_shell-${revision}`);
  if (!revision || !existsSync(folder)) return null;
  const binary = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const found = readdirSync(folder)
    .filter((name) => name.startsWith("chrome-headless-shell-"))
    .map((name) => join(folder, name, binary))
    .find((path) => existsSync(path));
  return found ?? null;
}

/**
 * The designer's user-level Cursor plugins that open a browser, by their own
 * names, each with the MCP server it declares (same name, same package), but
 * headless, with a profile of its own, on `shell` when there is one (else on
 * Chrome, still headless). Cursor loads them with `--plugin-dir` in place of
 * the installed ones: the Agent keeps the same tools under the same names, and
 * the plugins' Skills, and no browser window comes up on the designer's screen.
 */
export function browserPlugins(headlessShellPath: string | null): { name: BrowserPlugin; mcpServers: Record<string, { command: string; args: string[] }> }[] {
  const path = (flag: string) => (headlessShellPath ? [flag, headlessShellPath] : []);
  return [
    { name: "playwright", mcpServers: { playwright: { command: "npx", args: ["-y", `@playwright/mcp@${PLAYWRIGHT_MCP}`, "--headless", "--isolated", ...path("--executable-path")] } } },
    { name: "chrome-devtools-mcp", mcpServers: { "chrome-devtools": { command: "npx", args: ["-y", "chrome-devtools-mcp@1.11.0", "--headless", "--isolated", ...path("--executablePath")] } } },
  ];
}

/**
 * The version of `@playwright/mcp` the designer's plugin asks for as `@latest`,
 * pinned to the one npx had installed for it when 64 and 65 ran (ticket 63):
 * `@latest` asks the registry on every run, and would follow a new release.
 */
export const PLAYWRIGHT_MCP = "0.0.83";

/** The designer's browser plugins the bench gives Cursor headless copies of, by their names. */
const BROWSER_PLUGINS = ["playwright", "chrome-devtools-mcp"] as const;
type BrowserPlugin = (typeof BROWSER_PLUGINS)[number];

/** Where a run's own copy of a browser plugin goes, in its folder: out of the project the Agent sees. */
const pluginDir = (folder: string, name: string) => join(folder, "cursor-plugins", name);

/** The pi the designer installed with npm. */
const DESIGNERS_PI = join(homedir(), ".npm-global/bin/pi");

/**
 * The Command Code provider, an extension the designer installed in pi
 * (`pi install`, in their agent directory): pi's `command-code` models come
 * from it, and the designer's login to it is in that directory's auth.json.
 */
const COMMAND_CODE = join(homedir(), ".pi/agent/npm/node_modules/@commandcode/pi-commandcode-provider");

/**
 * pi-fff, another extension the designer installed in pi (ticket 92): fff's search tools in place of pi's own find
 * and grep, which need fd and rg, by their names (its override mode). Its finder is a native library its npm package brings
 * along (`@ff-labs/fff-bin-<platform>`): nothing is fetched, on or off the Agent's PATH.
 */
const PI_FFF = join(homedir(), ".pi/agent/npm/node_modules/@ff-labs/pi-fff");

/** The version of pi-fff installed, as its package says; null when there is none. */
export function piFffVersion(dir = PI_FFF): string | null {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/** Where a run's own fff databases go, in its folder: what files it found often, and which files its queries led to. */
const fffDb = (folder: string, name: "frecency" | "history") => join(folder, "fff", name);

/** The bench's extension for pi, and the rule it holds shell commands to, by their names here and in the run's folder. */
const PI_EXTENSION = ["pi-extension.ts", "allowlist.ts"];
const piExtensionDir = (folder: string) => join(folder, "pi-extension");

export interface AgentSpec {
  /** Where the Agent's binary is; an environment variable names another. */
  binary(): string;
  /**
   * The arguments, after the binary: the same for every run but where the
   * run's own files go, in `folder`, what the Agent is told, and the run's
   * project (`project`, the placeholder `PROJECT` for the record).
   */
  args(folder: string, prompt?: string, project?: string): string[];
  /** The model every run is to be on, as the transcript names it: a run on another stops the bench. */
  model: string;
  /** The reasoning effort the arguments set, for the record. */
  effort: string;
  /** The effort the run says the session ran at, from what it left in `folder`; null when it does not say. None for an Agent that never says. */
  effortSeen?(folder: string): string | null;
  /** Done before the Agent starts: in the project, `dir`, and in the run's own folder. What it returns goes in the run's record. */
  prepare?(dir: string, folder: string): Pick<AgentRun, "headlessShell"> | void;
  /**
   * What `prepare` puts in the project, by path from its root (a folder ends
   * in `/`): the bench's, not the Agent's work. Kept out of git in each run's
   * copy (so out of the diff), and out of the source a scenario's expectation
   * compares with the round's start (`sourceAsAtStart`).
   */
  files?: string[];
  /** The extensions of others the Agent runs with whose version the record keeps (pi-fff's), by name: the version installed, or null with none. */
  extensions?(): Record<string, string | null>;
}

/** The run's project, in a command line for the record: each run has its own (`commandLine`). */
export const PROJECT = "<project>";

/**
 * Claude's rules for the Skill's own undo and its viewing command, as
 * `npx 03kind last` prints them (`git -C "<repo>" diff …`, `… | git -C
 * "<repo>" apply`, the repository by its real path), for the run's own
 * project only: by that path and as the bench names it, quoted and not; and
 * `git apply` as it is, the patch on its input (`EXACT`), not by prefix.
 */
function undoRules(project: string): string[] {
  const dirs = [...new Set([isAbsolute(project) ? realPath(project) : project, project])];
  const gits = dirs.flatMap((dir) => [`git -C "${dir}"`, `git -C ${dir}`]);
  return [...gits.map((git) => `Bash(${git} diff:*)`), ...gits.map((git) => `Bash(${git} apply)`), ...EXACT.map((command) => `Bash(${command})`)];
}

export const AGENTS: Record<AgentName, AgentSpec> = {
  claude: {
    // The Claude Code the designer's desktop app ships, not one installed by npm.
    binary: () => process.env.TK_BENCH_CLAUDE ?? desktopClaudeCode(),
    model: "claude-sonnet-5-5",
    effort: "high (--effort high)",
    // In its debug log only.
    effortSeen: (folder) => /\beffort["'\s:=]+["']?(low|medium|high|xhigh|max)\b/i.exec(readOr(join(folder, "claude-debug.log")))?.[1] ?? null,
    args: (folder, prompt = PROMPT, project = PROJECT) => [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      // Pinned: neither the account's default model nor the designer's effortLevel setting.
      "--model",
      "claude-sonnet-5-5",
      "--effort",
      "high",
      // The effort the session ran at is in its debug log only.
      "--debug-file",
      join(folder, "claude-debug.log"),
      // The project's settings only: none of the designer's plugins, hooks or MCP servers.
      "--setting-sources",
      "project,local",
      "--strict-mcp-config",
      "--no-chrome",
      "--no-session-persistence",
      // Edits in the project go ahead; tools are an allowlist; any other shell command is turned away.
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "TodoWrite", "Skill", ...SHELL.map((command) => `Bash(${command}:*)`), ...undoRules(project)].join(","),
      "--disallowedTools",
      "WebFetch,WebSearch",
    ],
  },
  cursor: {
    // The agent-cli the Cursor app runs its own Agent with; else the one installed on its own.
    binary: () => process.env.TK_BENCH_CURSOR ?? (existsSync(CURSOR_APP_AGENT) ? CURSOR_APP_AGENT : onPath("cursor-agent")),
    // Run headless, Cursor turns every shell command away unless forced, its allowlist or not: forced, in its
    // sandbox (writes in the project only), with the commands below denied besides.
    // Pinned to the model the designer chose (Grok 4.7 256K High, as its runs name it); its explore subagent keeps its own.
    model: "Grok 4.7 256K High",
    effort: "high (in --model)",
    // The browser plugins as the run's own, headless (browserPlugins).
    args: (folder, prompt = PROMPT) => [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--model",
      // Baselines A and B ran it as `grok-4.7[context=256k,reasoning_effort=high,fast=false]`, the id in the designer's
      // Cursor settings. The account turned that id away on 10/31, now and then; the designer confirmed `grok-4.7-high`
      // is the same model, and it is the bench's id from baseline B' on (ticket 63).
      process.env.TK_BENCH_CURSOR_MODEL ?? "grok-4.7-high",
      "--trust",
      "--force",
      "--sandbox",
      "enabled",
      ...BROWSER_PLUGINS.flatMap((name) => ["--plugin-dir", pluginDir(folder, name)]),
    ],
    files: [".cursor/"],
    prepare(dir, folder) {
      mkdirSync(join(dir, ".cursor"), { recursive: true });
      const shell = [...new Set(SHELL.map((command) => command.split(" ")[0]))].map((command) => `Shell(${command})`);
      const denied = ["rm", "sudo", "curl", "wget", "ssh", "scp", "open", "osascript", "kill", "pkill"].map((command) => `Shell(${command})`);
      writeFileSync(join(dir, ".cursor/cli.json"), `${JSON.stringify({ permissions: { allow: [...shell, "Read(**)", "Write(**)"], deny: denied } }, null, 2)}\n`);
      const headlessShellPath = headlessShell();
      for (const { name, mcpServers } of browserPlugins(headlessShellPath)) {
        mkdirSync(join(pluginDir(folder, name), ".cursor-plugin"), { recursive: true });
        writeFileSync(join(pluginDir(folder, name), ".cursor-plugin/plugin.json"), `${JSON.stringify({ name, description: "The bench's headless copy", mcpServers: "./mcp.json" }, null, 2)}\n`);
        writeFileSync(join(pluginDir(folder, name), "mcp.json"), `${JSON.stringify({ mcpServers }, null, 2)}\n`);
      }
      return { headlessShell: headlessShellPath };
    },
  },
  pi: {
    // The designer's pi, run with no terminal: `-p` prints and exits, and nothing of it opens a window.
    binary: () => process.env.TK_BENCH_PI ?? DESIGNERS_PI,
    // The provider and the model as the transcript's answers name them (metrics.ts, parsePi).
    model: "command-code/deepseek/deepseek-v4.1-flash",
    effort: "high (--thinking high)",
    // On each answer in the transcript.
    effortSeen: (folder) => /"thinkingLevel":"(\w+)"/.exec(readOr(join(folder, "transcript.jsonl")))?.[1] ?? null,
    // Project-only, as Claude's `--setting-sources project,local --strict-mcp-config`, in the designer's own agent
    // directory (~/.pi/agent): that is where pi keeps their login, and pi has no setting or variable that points at
    // a login elsewhere, so a directory of the bench's own (PI_CODING_AGENT_DIR) would need the credentials copied
    // into it. What that directory would bring in is switched off instead: every extension but the provider and
    // pi-fff (their MCP adapter, fff's broad-search guard, web access, subagents and the rest) and pi's own MCP;
    // every skill but the project's, named by its path, so a project with no Skill (ticket 65) has none; prompt
    // templates; themes. Their global AGENTS.md has no switch of its own (`--no-context-files` would drop the
    // project's too): the bench's extension keeps only the project's. Their settings.json (compaction, for one)
    // and models.json (their overrides of a model's settings) still apply: pi reads them from that directory with
    // no way round it but another directory.
    args: (folder, prompt = PROMPT) => [
      "-p",
      prompt,
      "--mode",
      "json",
      // Pinned: neither the designer's default provider and model nor their default thinking level.
      "--provider",
      "command-code",
      "--model",
      "deepseek/deepseek-v4.1-flash",
      "--thinking",
      "high",
      "--no-session",
      // No version check or model catalog refresh: on the network, only the model (and the provider's model list).
      "--offline",
      "--no-extensions",
      "-e",
      COMMAND_CODE,
      // fff's search tools, unrestricted, as the designer's own pi has them: in override mode, under the names of pi's
      // own grep and find, which they take the place of (a transcript tells them apart by the parameters its system
      // prompt declares: metrics.ts, parsePi). Pinned here, over the designer's pi-fff.json (~/.pi/agent, which
      // pi-fff reads all the same: one it finds invalid stops pi before any model call).
      // Each run's databases are its own, in its folder: none reads or writes the designer's (~/.pi/agent/fff), or
      // another run's. Following links into folders is pi-fff's default, pinned; its other settings (indexing the
      // home folder or the root) only tell on a search over a folder above ~/.pi, which the bench's extension blocks,
      // and pi 1.4.0 sets an extension's yes-or-no flag only to yes.
      "-e",
      PI_FFF,
      "--fff-mode",
      "override",
      "--fff-frecency-db",
      fffDb(folder, "frecency"),
      "--fff-history-db",
      fffDb(folder, "history"),
      "--fff-follow-symlinks",
      // Blocks every shell command off the bench's list, and keeps the designer's global AGENTS.md out (pi-extension.ts).
      "-e",
      join(piExtensionDir(folder), "pi-extension.ts"),
      "--no-mcp",
      "--no-skills",
      "--skill",
      ".agents/skills/03kind",
      "--no-prompt-templates",
      "--no-themes",
      // Trusts the project, as it would be once the designer has opened it in pi.
      "--approve",
      // The tools of Claude's allowlist: no web search or fetch (pi has none of its own), no codemode. grep and find
      // (Claude's Grep and Glob) are fff's: pi's own find would need fd, which is not on the Agent's PATH, and
      // --offline stops pi fetching it. No multi_grep: pi-fff 0.11.0 leaves it out unless PI_FFF_MULTIGREP=1, which
      // neither the designer's shell nor the Agent's environment (cleanEnv) sets.
      "--tools",
      "read,bash,edit,write,ls,grep,find",
    ],
    prepare(_dir, folder) {
      // A copy in the run's folder: the command line is the same from any checkout, and the run keeps what it ran with.
      mkdirSync(piExtensionDir(folder), { recursive: true });
      for (const file of PI_EXTENSION) copyFileSync(fileURLToPath(new URL(file, import.meta.url)), join(piExtensionDir(folder), file));
    },
    extensions: () => ({ "pi-fff": piFffVersion() }),
  },
};

/** What the bench puts in a run's project for any of the Agents (`AgentSpec.files`). */
export const BENCH_FILES = [...new Set(Object.values(AGENTS).flatMap((spec) => spec.files ?? []))];

/** The command line as a person would type it, for the record; `spec`, another way of running it (the install bench's). */
export function commandLine(agent: AgentName, prompt = PROMPT, spec: Pick<AgentSpec, "binary" | "args"> = AGENTS[agent]): string {
  const { binary, args } = spec;
  return [binary(), ...args("<run folder>", prompt, PROJECT)].map((part) => (/^[\w./:,=-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`)).join(" ");
}

export async function agentVersion(agent: AgentName): Promise<string> {
  const { stdout } = await output(AGENTS[agent].binary(), ["--version"], tmpdir(), 30_000);
  return stdout.trim();
}

export interface AgentRun {
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  endedAt: number;
  /** The headless shell the Agent's browser plugins were given (Cursor), or null when none was found and they fell back on Chrome, headless. */
  headlessShell?: string | null;
  /** Each browser that came up under the Agent with a window, as the process table showed it once a second (one that lived less than a second can be missed): none, if the bench kept its promise. */
  headedBrowsers: string[];
}

export interface ProcessRow {
  pid: number;
  ppid: number;
  /** Its process group, as `processTable` lists it. */
  pgid?: number;
  command: string;
}

/** The processes under `roots`, the roots among them. */
export function descendants(processes: Pick<ProcessRow, "pid" | "ppid">[], roots: Iterable<number>): Set<number> {
  const under = new Set(roots);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { pid, ppid } of processes) {
      if (!under.has(pid) && under.has(ppid)) {
        under.add(pid);
        grew = true;
      }
    }
  }
  return under;
}

/** A browser's own executable, as a command line starts (its helpers carry `--type=`). */
const BROWSER = /(?:^|\/)(?:Google Chrome(?: for Testing| Canary| Beta| Dev)?|Chromium|chrome|chromium|Microsoft Edge|msedge|firefox)(?:\s|$)/;

/** The command lines of the browsers under process `root` that run with a window: neither Playwright's headless shell nor started `--headless`. */
export function headedBrowsers(processes: ProcessRow[], root: number): string[] {
  const under = descendants(processes, [root]);
  return processes
    .filter(({ pid, command }) => under.has(pid) && BROWSER.test(command) && !/--type=|chrome-headless-shell/.test(command) && !/(?:^|\s)--?headless(?:=\S*)?(?:\s|$)/.test(command))
    .map(({ command }) => command);
}

/** Every process on the machine, as `ps` lists it. */
export async function processTable(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync("ps", ["-axww", "-o", "pid=,ppid=,pgid=,command="], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\n").flatMap((line) => {
    const [, pid, ppid, pgid, command] = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line) ?? [];
    return pid ? [{ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), command }] : [];
  });
}

/** How long, once an Agent that leaves things running has exited, its output still gets to come in. */
const LEFT_RUNNING_DRAIN_MS = 2000;

/** How the install bench (ticket 91) runs an Agent otherwise than the applying bench: all of it optional. */
export interface RunOptions {
  /** Another binary, arguments and preparing in place of the Agent's: Claude's with the install lists, pi's with its list, or the scripted Agent. */
  spec?: Pick<AgentSpec, "binary" | "args" | "prepare">;
  /** The environment, in place of `cleanEnv()`. */
  env?: NodeJS.ProcessEnv;
  /** Told the Agent's process id as soon as it has started. */
  onStart?(pid: number): void;
  /**
   * Leaves what the Agent started running once it exits (its dev server), for the bench to stop itself; still
   * stopped on a timeout. The Agent's end is then its own exit, not its output closing, which a server can hold.
   */
  leaveRunning?: boolean;
}

/**
 * Runs the Agent in `dir`, told `prompt`, its transcript to `transcript` and what else it
 * prints to `log`, its own files in `folder`; stopped after `timeoutMs`. What
 * it leaves running once it exits (Cursor's worker server) goes with it, unless `options.leaveRunning`.
 */
export async function runAgent(agent: AgentName, dir: string, folder: string, timeoutMs: number, prompt = PROMPT, options: RunOptions = {}): Promise<AgentRun> {
  const spec = { ...AGENTS[agent], ...options.spec };
  const prepared = spec.prepare?.(dir, folder);
  const startedAt = Date.now();
  const child = spawn(spec.binary(), spec.args(folder, prompt, dir), { cwd: dir, env: options.env ?? cleanEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
  if (child.pid) options.onStart?.(child.pid);
  // Only looked at, never stopped: a window that came up is for the record.
  const headed = new Set<string>();
  let looking: Promise<void> = Promise.resolve();
  const watch = setInterval(() => {
    if (child.pid) looking = processTable().then((processes) => headedBrowsers(processes, child.pid!).forEach((command) => headed.add(command)), () => {});
  }, 1000);
  child.stdout.pipe(createWriteStream(join(folder, "transcript.jsonl")));
  child.stderr.pipe(createWriteStream(join(folder, "agent.log")));
  const stopAll = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      // All gone already.
    }
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stopAll();
  }, timeoutMs);
  const closed = new Promise<number | null>((resolve) => child.on("close", resolve));
  // What it leaves running may hold its output open (a dev server started with its stdout): its end is
  // its own exit, then what it printed gets a short while to come in.
  const exitCode = options.leaveRunning ? await new Promise<number | null>((resolve) => child.on("exit", resolve)) : await closed;
  if (options.leaveRunning) await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, LEFT_RUNNING_DRAIN_MS))]);
  clearTimeout(timer);
  clearInterval(watch);
  await looking;
  if (!options.leaveRunning) stopAll();
  return { exitCode, timedOut, startedAt, endedAt: Date.now(), ...prepared, headedBrowsers: [...headed] };
}

/** A file's text, or none when there is no such file. */
function readOr(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** What a short command prints. */
function output(binary: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", () => resolve({ stdout }));
  });
}
