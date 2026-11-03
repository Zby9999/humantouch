/**
 * What an Agent may do while it installs 03Kind (ticket 91): the applying
 * bench's allowlist turns away `npx -y 03kind@latest init` and starting a dev
 * server, so installing has a list of its own. Data first, so Claude's
 * command line and, later, pi's extension (ticket 85) are made from the same
 * list; then Claude's command line, made from the applying bench's own with
 * only its lists swapped, so a change to how Claude runs reaches both benches.
 */
import { AGENTS } from "./agents.ts";

/**
 * The tools that read, edit and search, as the applying bench has them, and
 * Claude Code's tool that stops a shell it left running in the background
 * (`TaskStop`; `KillShell` and `KillBash` are its older names, which 2.1.309
 * still takes). What a background shell printed is read with Read, from the
 * file Claude Code writes it to: 2.1.309 has no tool of its own for that.
 */
export const INSTALL_TOOLS = ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "TodoWrite", "Skill", "TaskStop"];

/**
 * The shell commands an installing Agent may run, each a prefix of a command
 * line. Reading: the same as the applying bench. `npx`, whole: step 1 is
 * `npx -y 03kind@latest init`, step 4 `npx 03kind doctor`, and a dev server
 * may be started by `npx vite` or `npx next dev`. Of each package manager,
 * only installing (what `init` does, and what an Agent does when a dependency
 * is missing), running a script (`dev`, and `build` to check one) and running
 * a binary of the project's; not uninstalling, publishing, linking or setting
 * config. `pnpm dev`, `yarn dev` and `bun dev` run the `dev` script, as `init`
 * prints for pnpm and yarn; bare `yarn` (an install too) is left out, as
 * `Bash(yarn:*)` would let every yarn command by.
 */
export const INSTALL_SHELL = [
  // Reading the project, and what git sees of it.
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "rg",
  "find",
  "git status",
  "git diff",
  // Running packages.
  "npx",
  "bunx",
  ...["install", "i", "ci", "run", "exec"].map((sub) => `npm ${sub}`),
  ...["install", "i", "add", "run", "exec", "dlx", "dev"].map((sub) => `pnpm ${sub}`),
  ...["install", "add", "run", "exec", "dlx", "dev"].map((sub) => `yarn ${sub}`),
  ...["install", "add", "run", "x", "dev"].map((sub) => `bun ${sub}`),
];

/** Shell commands turned away even where a prefix above would let them by (`npx rm` is not `rm`, but `rm` after `&&` is). */
export const INSTALL_DENIED_SHELL = ["rm", "sudo", "kill", "pkill", "curl", "wget", "ssh", "scp", "open", "osascript", "git push"];

/** Tools turned away: the web. */
export const INSTALL_DENIED_TOOLS = ["WebFetch", "WebSearch"];

/** Whether `command` starts with `prefix` as a whole word: `git diff` takes `git diff --stat`, not `git difftool`. */
const startsWith = (command: string, prefix: string) => command === prefix || command.startsWith(`${prefix} `);

/**
 * Whether the allowlist lets a shell command line by: each command in it
 * (split at `&&`, `||`, `;`, `|` and a `&` that sends one to the background) starts with an allowed prefix, and
 * none with a denied one. The same rule Claude Code applies to its
 * `Bash(<prefix>:*)` lists, for the unit tests and for an Agent the bench
 * enforces it on itself (pi's extension, ticket 85).
 */
export function installShellAllowed(commandLine: string): boolean {
  const commands = commandLine
    // A redirect such as `2>&1` joins no commands.
    .replace(/\d*>&\d*/g, ">")
    .split(/&&|\|\||;|\||&/)
    .map((part) => part.trim().replace(/^(?:\w+=\S*\s+)+/, ""))
    .filter(Boolean);
  return commands.length > 0 && commands.every((command) => !INSTALL_DENIED_SHELL.some((denied) => startsWith(command, denied)) && INSTALL_SHELL.some((allowed) => startsWith(command, allowed)));
}

/** The flags of Claude's command line that carry its lists. */
const LISTS = { "--allowedTools": () => [...INSTALL_TOOLS, ...INSTALL_SHELL.map((command) => `Bash(${command}:*)`)].join(","), "--disallowedTools": () => [...INSTALL_DENIED_TOOLS, ...INSTALL_DENIED_SHELL.map((command) => `Bash(${command}:*)`)].join(",") };

/**
 * Claude's arguments for an install run: the applying bench's (`AGENTS.claude`),
 * the same binary, model, effort and isolation, with the allow and deny lists
 * swapped for the ones above (deny wins in Claude Code).
 */
export function installClaudeArgs(folder: string, prompt: string): string[] {
  const args = AGENTS.claude.args(folder, prompt);
  for (const [flag, list] of Object.entries(LISTS)) {
    const at = args.indexOf(flag);
    if (at < 0) throw new Error(`Claude's command line has no ${flag}: the install lists have nowhere to go`);
    args[at + 1] = list();
  }
  return args;
}
