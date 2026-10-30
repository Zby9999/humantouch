/**
 * The Agents the bench runs, each by one command line, fixed here: the
 * numbers of two rounds compare only when both ran the same one (docs/goals.md,
 * Measuring). Each runs unattended in the run's project, on the account's
 * default model, in an environment with nothing of the shell it was started
 * from (no gateway, no model override), as the designer's own login.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { AgentName } from "./metrics.ts";

/** What the designer says to the Agent: the Skill's own trigger. */
export const PROMPT = "落地我的设计改动";

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

/** The shell commands an Agent may run: the command line, and reading the project. */
const SHELL = ["npx vernierkit", "git diff", "git status", "git log", "git show", "ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "npx tsc"];

export interface AgentSpec {
  /** Where the Agent's binary is; an environment variable names another. */
  binary(): string;
  /** The arguments, after the binary: the same for every run. */
  args: string[];
  /** Done in the project before the Agent starts. */
  prepare?(dir: string): void;
}

export const AGENTS: Record<AgentName, AgentSpec> = {
  claude: {
    // The Claude Code the designer's desktop app ships, not one installed by npm.
    binary: () => process.env.VK_BENCH_CLAUDE ?? desktopClaudeCode(),
    args: [
      "-p",
      PROMPT,
      "--output-format",
      "stream-json",
      "--verbose",
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
    args: ["-p", PROMPT, "--output-format", "stream-json", "--trust", "--force", "--sandbox", "enabled"],
    prepare(dir) {
      mkdirSync(join(dir, ".cursor"), { recursive: true });
      const shell = [...new Set(SHELL.map((command) => command.split(" ")[0]))].map((command) => `Shell(${command})`);
      const denied = ["rm", "sudo", "curl", "wget", "ssh", "scp", "open", "osascript", "kill", "pkill"].map((command) => `Shell(${command})`);
      writeFileSync(join(dir, ".cursor/cli.json"), `${JSON.stringify({ permissions: { allow: [...shell, "Read(**)", "Write(**)"], deny: denied } }, null, 2)}\n`);
    },
  },
};

/** The command line as a person would type it, for the record. */
export function commandLine(agent: AgentName): string {
  const { binary, args } = AGENTS[agent];
  return [binary(), ...args].map((part) => (/^[\w./:,=-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`)).join(" ");
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
}

/** Runs the Agent in `dir`, its transcript to `transcript` and what else it prints to `log`; stopped after `timeoutMs`. */
export async function runAgent(agent: AgentName, dir: string, transcript: string, log: string, timeoutMs: number): Promise<AgentRun> {
  const spec = AGENTS[agent];
  spec.prepare?.(dir);
  const startedAt = Date.now();
  const child = spawn(spec.binary(), spec.args, { cwd: dir, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
  child.stdout.pipe(createWriteStream(transcript));
  child.stderr.pipe(createWriteStream(log));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  }, timeoutMs);
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  clearTimeout(timer);
  return { exitCode, timedOut, startedAt, endedAt: Date.now() };
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
