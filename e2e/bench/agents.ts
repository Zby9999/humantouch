/**
 * The Agents the bench runs, each by one command line, fixed here: the
 * numbers of two rounds compare only when both ran the same one (docs/goals.md,
 * Measuring). Each runs unattended in the run's project, on the model its
 * arguments pin, in an environment with nothing of the shell it was started
 * from (no gateway, no model setting), as the designer's own login.
 * VK_BENCH_CLAUDE and VK_BENCH_CURSOR name another binary; VK_BENCH_CURSOR_MODEL
 * another id of Cursor's model, which must name the same model (its command
 * line, in meta.json, shows the id; a run on another model stops the bench).
 */
import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import type { AgentName } from "./metrics.ts";

const execFileAsync = promisify(execFile);

/** What the designer says to the Agent: the Skill's own trigger. */
export const PROMPT = "落地我的设计改动";
/** What the Agent is told in a project with no Skill (ticket 65): only to run `claim` and apply as it says. */
export const NO_SKILL_PROMPT = "运行 `npx vernierkit claim`，照输出落地";

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
  throw new Error(`No Claude Code of the desktop app in ${DESKTOP_CLAUDE_CODE}: name one with VK_BENCH_CLAUDE`);
}

/**
 * Playwright's headless shell, for the Agent's own browsers: the one
 * VK_BENCH_HEADLESS_SHELL names, else the one installed beside the Chromium
 * the repository's Playwright launches. Null when there is none.
 */
export function headlessShell(env: NodeJS.ProcessEnv = process.env, chromiumPath = chromium.executablePath()): string | null {
  const named = env.VK_BENCH_HEADLESS_SHELL;
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

/** The shell commands an Agent may run: the command line, and reading the project. */
const SHELL = ["npx vernierkit", "git diff", "git status", "git log", "git show", "ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "npx tsc"];

export interface AgentSpec {
  /** Where the Agent's binary is; an environment variable names another. */
  binary(): string;
  /** The arguments, after the binary: the same for every run but where the run's own files go, in `folder`, and what the Agent is told. */
  args(folder: string, prompt?: string): string[];
  /** The model every run is to be on, as the transcript names it: a run on another stops the bench. */
  model: string;
  /** The reasoning effort the arguments set, for the record. */
  effort: string;
  /** Done before the Agent starts: in the project, `dir`, and in the run's own folder. What it returns goes in the run's record. */
  prepare?(dir: string, folder: string): Pick<AgentRun, "headlessShell"> | void;
}

export const AGENTS: Record<AgentName, AgentSpec> = {
  claude: {
    // The Claude Code the designer's desktop app ships, not one installed by npm.
    binary: () => process.env.VK_BENCH_CLAUDE ?? desktopClaudeCode(),
    model: "claude-sonnet-5-5",
    effort: "high (--effort high)",
    args: (folder, prompt = PROMPT) => [
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
      ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "TodoWrite", "Skill", ...SHELL.map((command) => `Bash(${command}:*)`)].join(","),
      "--disallowedTools",
      "WebFetch,WebSearch",
    ],
  },
  cursor: {
    // The agent-cli the Cursor app runs its own Agent with; else the one installed on its own.
    binary: () => process.env.VK_BENCH_CURSOR ?? (existsSync(CURSOR_APP_AGENT) ? CURSOR_APP_AGENT : onPath("cursor-agent")),
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
      process.env.VK_BENCH_CURSOR_MODEL ?? "grok-4.7-high",
      "--trust",
      "--force",
      "--sandbox",
      "enabled",
      ...BROWSER_PLUGINS.flatMap((name) => ["--plugin-dir", pluginDir(folder, name)]),
    ],
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
};

/** The command line as a person would type it, for the record. */
export function commandLine(agent: AgentName, prompt = PROMPT): string {
  const { binary, args } = AGENTS[agent];
  return [binary(), ...args("<run folder>", prompt)].map((part) => (/^[\w./:,=-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`)).join(" ");
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
  command: string;
}

/** A browser's own executable, as a command line starts (its helpers carry `--type=`). */
const BROWSER = /(?:^|\/)(?:Google Chrome(?: for Testing| Canary| Beta| Dev)?|Chromium|chrome|chromium|Microsoft Edge|msedge|firefox)(?:\s|$)/;

/** The command lines of the browsers under process `root` that run with a window: neither Playwright's headless shell nor started `--headless`. */
export function headedBrowsers(processes: ProcessRow[], root: number): string[] {
  const under = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { pid, ppid } of processes) {
      if (!under.has(pid) && under.has(ppid)) {
        under.add(pid);
        grew = true;
      }
    }
  }
  return processes
    .filter(({ pid, command }) => under.has(pid) && BROWSER.test(command) && !/--type=|chrome-headless-shell/.test(command) && !/(?:^|\s)--?headless(?:=\S*)?(?:\s|$)/.test(command))
    .map(({ command }) => command);
}

/** Every process on the machine, as `ps` lists it. */
async function processTable(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync("ps", ["-axww", "-o", "pid=,ppid=,command="], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\n").flatMap((line) => {
    const [, pid, ppid, command] = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line) ?? [];
    return pid ? [{ pid: Number(pid), ppid: Number(ppid), command }] : [];
  });
}

/**
 * Runs the Agent in `dir`, told `prompt`, its transcript to `transcript` and what else it
 * prints to `log`, its own files in `folder`; stopped after `timeoutMs`. What
 * it leaves running once it exits (Cursor's worker server) goes with it.
 */
export async function runAgent(agent: AgentName, dir: string, folder: string, timeoutMs: number, prompt = PROMPT): Promise<AgentRun> {
  const spec = AGENTS[agent];
  const prepared = spec.prepare?.(dir, folder);
  const startedAt = Date.now();
  const child = spawn(spec.binary(), spec.args(folder, prompt), { cwd: dir, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
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
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  clearTimeout(timer);
  clearInterval(watch);
  await looking;
  stopAll();
  return { exitCode, timedOut, startedAt, endedAt: Date.now(), ...prepared, headedBrowsers: [...headed] };
}

/** The effort the run's debug log says the session ran at, if it says. */
export function effortSeen(folder: string): string | null {
  try {
    const log = readFileSync(join(folder, "claude-debug.log"), "utf8");
    return /\beffort["'\s:=]+["']?(low|medium|high|xhigh|max)\b/i.exec(log)?.[1] ?? null;
  } catch {
    return null;
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
