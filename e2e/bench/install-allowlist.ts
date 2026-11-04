/**
 * What an Agent may do while it installs 03Kind (ticket 91): the applying
 * bench's allowlist turns away `npx -y 03kind@latest init` and starting a dev
 * server, so installing has a list of its own. Data first, so Claude's
 * command line and pi's extension (ticket 85) are made from the same list;
 * then how each runs, made from the applying bench's own with only the lists
 * swapped, so a change to how Claude or pi runs reaches both benches.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS } from "./agents.ts";
import { INSTALL_LIST, type ShellList } from "./pi-extension.ts";

/**
 * The tools that read, edit and search, as the applying bench has them, and
 * Claude Code's tool that stops a shell it left running in the background
 * (`TaskStop`; `KillShell` and `KillBash` are its older names, which 2.1.309
 * still takes). What a background shell printed is read with Read, from the
 * file Claude Code writes it to: 2.1.309 has no tool of its own for that.
 */
const INSTALL_TOOLS = ["Read", "Edit", "MultiEdit", "Write", "Glob", "Grep", "TodoWrite", "Skill", "TaskStop"];

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

/** Shell commands Claude is denied besides (deny wins there over a prefix allowed, as `rm` after `&&`); pi's rule lets by only what is listed. */
export const INSTALL_DENIED_SHELL = ["rm", "sudo", "kill", "pkill", "curl", "wget", "ssh", "scp", "open", "osascript", "git push"];

/** Tools turned away: the web. */
const INSTALL_DENIED_TOOLS = ["WebFetch", "WebSearch"];

/**
 * The commands of the list that run a package's program, and the programs
 * each may run (ticket 91 re-review, 代定): an allowlist, as a list of what to
 * turn away leaks (a runner inside a runner, `nice`, `nohup`, any program on
 * PATH). The runners that fetch a package may run 03Kind (by a version, or
 * the packed file step 1 names with `--package local`) and the two dev
 * servers; those that run the project's own binaries, 03Kind and the servers.
 *
 * What no allowlist closes: with Write or Edit and a run-script form, an
 * Agent can write a script, or a `scripts` entry in package.json, that does
 * anything, and run it (`npm run x`). The bench keeps run-script forms, as
 * step 2 starts a dev server by one; it would show in the diff.
 */
const FETCHING_RUNNERS = ["npx", "bunx", "pnpm dlx", "yarn dlx", "bun x"];
const EXEC_RUNNERS = ["npm exec", "pnpm exec", "yarn exec"];
const RUNNABLE = ["03kind", "vite", "next"];
const INSTALL_RUNNERS: Record<string, string[]> = Object.fromEntries([...FETCHING_RUNNERS, ...EXEC_RUNNERS].map((runner) => [runner, RUNNABLE]));

/** Options a runner may have before its program: those that take no value, and none that runs a command line of its own (`-c`, `--call`, `--shell-mode`). */
const INSTALL_FLAGS = ["-y", "--yes", "--no-install", "--prefer-offline", "--prefer-online", "--offline", "--silent", "-s", "--quiet", "-q", "--"];

/** Options turned away in any command: `--open` opens a browser window on the designer's screen. */
const INSTALL_DENIED_OPTIONS = ["--open"];

/**
 * What may start a dev server in the background for pi (ticket 91): running
 * a package script, or a package's binary. pi's bash waits for what it runs,
 * and the applying bench's rule turns away `&` and redirects to a file; step 2
 * asks the Agent to leave the server running and go on. Only these forms get
 * the `&`, so no denied command can be sent to the background; what they run
 * is held to the runners' rule above. (Claude Code runs a command in the
 * background with its Bash tool's own option.)
 */
export const INSTALL_SERVERS = ["npm run", "npm exec", "pnpm run", "pnpm dev", "pnpm exec", "yarn run", "yarn dev", "yarn exec", "bun run", "bun dev", "bun x", "npx", "bunx"];

/**
 * Done before pi installs: what the applying bench does before it runs pi
 * (the extension copied into the run's folder), and the install list written
 * beside that copy, which the extension reads in place of the applying one.
 * The command line stays the applying bench's: the extension is found by it.
 */
export function prepareInstallPi(dir: string, folder: string): void {
  AGENTS.pi.prepare!(dir, folder);
  const extension = AGENTS.pi.args(folder).find((arg) => arg.endsWith("pi-extension.ts"));
  if (!extension) throw new Error("pi's command line loads no pi-extension.ts: the install list has nowhere to go");
  const list: ShellList = { shell: INSTALL_SHELL, servers: INSTALL_SERVERS, runners: INSTALL_RUNNERS, flags: INSTALL_FLAGS, options: INSTALL_DENIED_OPTIONS };
  writeFileSync(join(dirname(extension), INSTALL_LIST), `${JSON.stringify(list, null, 2)}\n`);
}

/**
 * Claude's runner rules, in place of the list's bare runners: each program a
 * runner may run, as its own `Bash(<prefix>:*)`. Claude Code matches a prefix
 * by whole words (`npx 03kind` is not `npx 03kind@latest`), so the versions
 * step 1 and a designer's install use are named too, after `-y` and `--yes`
 * as well; and the packed file step 1 names with `--package local`, read from
 * what the Agent is told.
 */
function claudeRunners(prompt: string): string[] {
  const fetched = FETCHING_RUNNERS.flatMap((runner) => ["", "-y ", "--yes "].flatMap((flag) => [...RUNNABLE, "03kind@latest"].map((program) => `${runner} ${flag}${program}`)));
  const exec = EXEC_RUNNERS.flatMap((runner) => RUNNABLE.map((program) => `${runner} ${program}`));
  const packed = /`(npx -y file:\S+\.tgz) init`/.exec(prompt)?.[1];
  return [...fetched, ...exec, ...(packed ? [packed] : [])];
}

/**
 * The commands Claude is denied, as `Bash(<prefix>:*)` rules (deny wins): the
 * denied commands, which a prefix allowed would let by after `&&`, and
 * `--open` where a prefix can name it. For a window, `BROWSER=none` in the
 * Agent's environment is the guard that holds (run-install.ts): Vite opens
 * none with it.
 */
export function claudeDenied(): string[] {
  return [
    ...INSTALL_DENIED_SHELL,
    ...["npx vite", "npx -y vite", "bunx vite", "pnpm exec vite", "npm exec vite", "yarn exec vite", "npm run dev --", "pnpm dev", "yarn dev", "bun run dev", "bun dev"].map((server) => `${server} --open`),
  ];
}

/** The flags of Claude's command line that carry its lists. */
const LISTS = {
  "--allowedTools": (prompt: string) =>
    [...INSTALL_TOOLS, ...INSTALL_SHELL.filter((command) => !(command in INSTALL_RUNNERS)), ...claudeRunners(prompt)].map((rule) => (INSTALL_TOOLS.includes(rule) ? rule : `Bash(${rule}:*)`)).join(","),
  "--disallowedTools": () => [...INSTALL_DENIED_TOOLS, ...claudeDenied().map((command) => `Bash(${command}:*)`)].join(","),
};

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
    args[at + 1] = list(prompt);
  }
  return args;
}
