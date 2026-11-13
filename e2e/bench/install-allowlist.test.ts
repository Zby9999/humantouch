import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { AGENTS } from "./agents.ts";
import { DENIED, SHELL } from "./allowlist.ts";
import { claudeDenied, INSTALL_DENIED_SHELL, INSTALL_SERVERS, INSTALL_SHELL, installClaudeArgs, installSpec, prepareInstallPi } from "./install-allowlist.ts";
import benchExtension, { INSTALL_LIST } from "./pi-extension.ts";

const scratch = mkdtempSync(join(tmpdir(), "humantouch-bench-install-allowlist-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const project = join(scratch, "project");
mkdirSync(join(project, "src"), { recursive: true });
const folder = join(scratch, "run");
mkdirSync(folder);
prepareInstallPi(project, folder);
const extension = AGENTS.pi.args(folder).find((arg) => arg.endsWith("pi-extension.ts"))!;
const listFile = join(dirname(extension), INSTALL_LIST);

/** The extension's tool_call handler, as pi would load it, from `file` for its list: a call of `toolName`. */
function call(toolName: string, input: object, file = listFile) {
  const handlers: Record<string, (event: any, ctx?: any) => any> = {};
  benchExtension({ on: (event, handler) => void (handlers[event] = handler) }, file);
  return handlers.tool_call({ type: "tool_call", toolName, toolCallId: "x", input }, { cwd: project });
}
const bash = (command: string, file = listFile) => call("bash", { command }, file);
const blocked = (result: any) => result?.block === true && result.reason.startsWith(DENIED);

test("before pi installs, the extension is copied as for the applying bench and the install list written beside it; pi's command line is the applying bench's", () => {
  assert.ok(existsSync(extension));
  const list = JSON.parse(readFileSync(listFile, "utf8"));
  assert.deepEqual(list.shell, INSTALL_SHELL);
  assert.deepEqual(list.servers, INSTALL_SERVERS);
  assert.deepEqual(list.options, ["--open"]);
  assert.deepEqual(list.runners.npx, ["humantouch", "humantouch-dev", "vite", "next"]);
  assert.ok(!list.flags.includes("-p") && !list.flags.includes("-c"));
  const args = AGENTS.pi.args(folder, "Install Human Touch");
  for (const flag of ["--provider", "--model", "--thinking", "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--skill", "--no-prompt-templates", "--no-themes", "--approve", "--tools"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[1], "Install Human Touch");
  // pi-fff as the applying bench has it, its databases in the run's folder: nothing of fff in the project, for remove to leave.
  assert.ok(args.includes("--fff-mode"));
  for (const flag of ["--fff-frecency-db", "--fff-history-db"]) assert.ok(args[args.indexOf(flag) + 1].startsWith(folder), flag);
});

test("the install bench runs pi by the applying bench's command line, and Claude by it with only its two lists other", () => {
  const prompt = "1. Run `npx -y file:/x/humantouch-0.0.0.tgz init`.";
  assert.deepEqual(installSpec("pi", null).args(folder, prompt), AGENTS.pi.args(folder, prompt));
  assert.equal(installSpec("pi", null).binary(), AGENTS.pi.binary());
  const claude = installSpec("claude", null).args(folder, prompt);
  const applying = AGENTS.claude.args(folder, prompt);
  assert.equal(claude.length, applying.length);
  const differ = applying.flatMap((arg, i) => (claude[i] === arg ? [] : [applying[i - 1]]));
  assert.deepEqual(differ, ["--allowedTools", "--disallowedTools"]);
});

test("under the install list, pi may run the steps and start a dev server in the background, and nothing denied", () => {
  for (const command of ["npx -y humantouch-dev@latest init", "npx -y file:/tmp/humantouch-0.0.0.tgz init", "npx humantouch doctor", "npm install", "pnpm add -D humantouch", "npm run dev &", "npm run dev > /dev/null 2>&1 &", "pnpm dev > dev.log 2>&1 &", "nohup yarn dev > src/../dev.log 2>&1 &", "git status", "npx vite > vite.log 2>&1 &"]) {
    assert.equal(bash(command), undefined, command);
  }
  for (const command of ["rm -rf node_modules", "curl https://example.com", "git push", "kill 123", "pkill -f vite", "sudo npm install", "open http://localhost:5173", "rm -rf src &", "kill 123 &", "npm run dev & rm -rf src", "npm run dev > /tmp/dev.log &", "npm run dev > ../dev.log &", "npm publish", "npm run dev `rm x` &",
    // Output only to /dev/null or a .log file: the judge holds no other file left against remove.
    "pnpm dev > dev.out 2>&1 &", "npm run dev > src/server.txt &"]) {
    const result = bash(command);
    assert.ok(blocked(result), command);
    assert.match(result.reason, /a dev server started in the background/);
  }
});

test("under the install list, pi's own folder stays out of reach, in the background too", () => {
  for (const command of ["cat ~/.pi/agent/auth.json", "npx vite ~/.pi &", "npm run dev > ~/.pi/agent/log &"]) assert.ok(blocked(bash(command)), command);
});

test("the Skill's undo is the applying bench's alone (ticket 86): under the install list pi may not run git apply, or git -C of the project as git, and the reason names neither", () => {
  for (const command of ["git apply", "git diff | git apply", `git -C ${project} status`, `git -C "${project}" diff`, "git apply &"]) {
    const result = bash(command);
    assert.ok(blocked(result), command);
    assert.doesNotMatch(result.reason.split("Turned away:")[0], /git apply|git -C/, command);
  }
  const none = join(scratch, "nothing-here.json");
  for (const command of [`git -C ${project} diff`, `git -C ${project} diff 1a2b3c 4d5e6f | git -C "${project}" apply`]) assert.equal(bash(command, none), undefined, command);
  assert.ok(blocked(bash("git apply", none)), "no bare git apply, on the applying list either");
  const claude = installClaudeArgs("/run", "Install Human Touch");
  const rules = [...claude[claude.indexOf("--allowedTools") + 1].split(","), ...claude[claude.indexOf("--disallowedTools") + 1].split(",")];
  assert.ok(!rules.some((rule) => /git apply|git -C/.test(rule)));
});

test("with no install list beside it, the extension holds pi to the applying bench's list, as before", () => {
  const none = join(scratch, "nothing-here.json");
  assert.equal(bash("npx humantouch claim", none), undefined);
  for (const command of ["npm run dev &", "npm install", "npx -y humantouch-dev@latest init", "pnpm dev"]) {
    const result = bash(command, none);
    assert.ok(blocked(result), command);
    assert.ok(result.reason.includes(SHELL.join(", ")));
    assert.doesNotMatch(result.reason, /dev server/);
  }
});

/** What the steps and a designer's install need: every Agent may run these. */
const ALLOWED = [
  "npx -y humantouch-dev@latest init",
  "npx -y file:/x/humantouch-0.0.0.tgz init",
  "npx humantouch doctor",
  "pnpm exec vite",
  "npx next dev",
  "npm run dev",
  "pnpm dev",
  "yarn dev",
  "bun run dev",
  "bunx vite",
  "npm install",
  "pnpm add -D @types/react",
  "git status",
  "git diff --stat",
  "ls -la",
  "cat package.json | head -5",
  "npx vite --port 5174",
];
/** Turned away for every Agent: the denied commands, and the ways round them through npx and the like (both reviews). */
const DENIED_ALL = [
  "rm -rf node_modules",
  "curl https://example.com",
  "git push",
  "npm run dev && rm -rf src",
  "sudo npm install",
  "kill 123",
  "pkill -f vite",
  "open http://localhost:5173",
  "wget x",
  "osascript -e 1",
  "pnpm exec kill 123",
  "npm exec -c 'kill 123'",
  "yarn exec rm -rf src",
  `pnpm exec sh -c 'ls ~/.p""i/agent'`,
  "npx -c 'rm -rf src'",
  "npx -y rm -rf src",
  "bunx node -e 1",
  "npx --call 'kill 1'",
  "pnpm dlx bash -c x",
  "npx vite --open",
  // A runner inside a runner, a wrapper, any program on PATH, an option with a value (the re-review).
  "pnpm exec npx -c 'kill 1'",
  "pnpm exec npm exec -c 'kill 1'",
  "pnpm exec nice kill 1",
  "pnpm exec nohup rm -rf src",
  "pnpm exec killall node",
  "pnpm exec find src -delete",
  "pnpm exec mv src /tmp/x",
  "pnpm exec bun -e 1",
  "npx -p typescript python3 -c 1",
  "pnpm exec security find-generic-password",
  "pnpm exec git --no-pager push",
  "npx -p typescript --loglevel silent kill 123",
];

test("pi, under the install list, runs the steps and turns away the denied commands and every bypass of the review", () => {
  for (const command of ALLOWED) assert.equal(bash(command), undefined, command);
  for (const command of [...DENIED_ALL, "npm exec -- rm -rf src", "npx -p cowsay sh", "yarn exec /bin/rm x", "npm publish", "pnpm remove humantouch", "yarn", "git commit -am x", "python3 -c 1", "npm run dev -- --open &", "npx humantouchx", "npx --version"]) {
    assert.ok(blocked(bash(command)), command);
  }
});

/**
 * Claude Code's permission rules as the tests take them, an approximation:
 * a command line is split at `&&`, `||`, `;`, `|` and a lone `&`, and each
 * command must start with an allowed `Bash(<prefix>:*)` and with no denied
 * one, by whole words, as 2.1.309 matches a prefix (the command is the prefix,
 * or starts with it and a space); deny wins. Claude Code's own matching parses the shell
 * further (it is not in this repository), so this checks the lists, not it.
 */
function claudeAllows(command: string): boolean {
  // Told as with --package local: the packed file step 1 names is allowed by its own path.
  const args = installClaudeArgs("/run", "1. Run `npx -y file:/x/humantouch-0.0.0.tgz init`.");
  const prefixes = (flag: string) => args[args.indexOf(flag) + 1].split(",").flatMap((rule) => /^Bash\((.*):\*\)$/.exec(rule)?.[1] ?? []);
  const [allow, deny] = [prefixes("--allowedTools"), prefixes("--disallowedTools")];
  const starts = (part: string, prefix: string) => part === prefix || part.startsWith(`${prefix} `);
  const parts = command
    .replace(/\d*>&\d*/g, ">")
    .split(/&&|\|\||;|\||&/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.every((part) => !deny.some((prefix) => starts(part, prefix)) && allow.some((prefix) => starts(part, prefix)));
}

test("Claude, by its install lists, runs the steps and is denied the denied commands and every bypass of the review", () => {
  for (const command of ALLOWED) assert.ok(claudeAllows(command), command);
  for (const command of DENIED_ALL) assert.ok(!claudeAllows(command), command);
});

test("Claude's install command line is the applying bench's with only the lists swapped", () => {
  const args = installClaudeArgs("/run", "Install Human Touch");
  const list = (flag: string) => args[args.indexOf(flag) + 1].split(",");
  assert.ok(list("--allowedTools").includes("Bash(pnpm dev:*)"));
  assert.ok(list("--allowedTools").includes("TaskStop"));
  for (const command of INSTALL_DENIED_SHELL) assert.ok(list("--disallowedTools").includes(`Bash(${command}:*)`), command);
  for (const rule of ["Bash(npx humantouch:*)", "Bash(npx -y humantouch-dev@latest:*)", "Bash(npx vite:*)", "Bash(pnpm exec vite:*)", "Bash(npx next:*)"]) assert.ok(list("--allowedTools").includes(rule), rule);
  for (const broad of ["Bash(npx:*)", "Bash(bunx:*)", "Bash(npm exec:*)", "Bash(pnpm exec:*)", "Bash(pnpm dlx:*)", "Bash(yarn dlx:*)", "Bash(bun x:*)"]) assert.ok(!list("--allowedTools").includes(broad), broad);
  assert.ok(list("--disallowedTools").includes("Bash(npx vite --open:*)"));
  assert.equal(list("--disallowedTools").length, 2 + claudeDenied().length);
  assert.ok(list("--disallowedTools").includes("WebFetch"));
  const applying = AGENTS.claude.args("/run", "Install Human Touch");
  // Everything else as the applying bench has it.
  for (const [i, arg] of applying.entries()) if (!["--allowedTools", "--disallowedTools"].includes(applying[i - 1])) assert.equal(args[i], arg);
});

test("fff's search tools (ticket 92) go ahead in the project under the install list as under the applying one, and never reach pi's own folder", () => {
  const none = join(scratch, "nothing-here.json");
  // grep and find are fff's in override mode; ffgrep, fffind and fff-multi-grep its own names.
  const inProject: [string, object][] = [
    ["grep", { pattern: "HumanTouch" }],
    ["grep", { pattern: "HumanTouch", path: "src/" }],
    ["find", { pattern: "vite.config" }],
    ["ffgrep", { pattern: "Card", path: "src/**/*.tsx" }],
    ["fffind", { pattern: "layout", path: "app" }],
    ["fff-multi-grep", { patterns: ["HumanTouch"], constraints: "*.tsx" }],
  ];
  const intoPi: [string, object][] = [
    ["grep", { pattern: "key", path: "~/.pi/agent" }],
    ["ffgrep", { pattern: "key", path: "~" }],
    ["fffind", { pattern: "auth", path: "~/.pi" }],
    ["find", { pattern: "auth", path: " ~/.pi " }],
    ["fff-multi-grep", { patterns: ["key"], constraints: "~/.pi/" }],
  ];
  for (const [tool, input] of inProject) {
    assert.equal(call(tool, input), undefined, `${tool} ${JSON.stringify(input)}`);
    assert.equal(call(tool, input, none), undefined, `${tool} ${JSON.stringify(input)}, applying list`);
  }
  for (const [tool, input] of intoPi) {
    assert.ok(blocked(call(tool, input)), `${tool} ${JSON.stringify(input)}`);
    assert.ok(blocked(call(tool, input, none)), `${tool} ${JSON.stringify(input)}, applying list`);
  }
});

test("under the install list, pi may remove a file it made, one git does not track (ticket 151), and nothing else", () => {
  // A project git tracks, as the starts are: src/App.tsx tracked; ht-check.mjs and the rest the Agent's own, new.
  const repo = join(scratch, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "tmp"), { recursive: true });
  writeFileSync(join(repo, "src", "App.tsx"), "export {};\n");
  writeFileSync(join(repo, ".gitignore"), "ignored.mjs\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "start"], { cwd: repo });
  for (const file of ["ht-check.mjs", "tmp/x.mjs", "src/new.mjs", "ignored.mjs"]) writeFileSync(join(repo, file), "// the Agent's\n");
  writeFileSync(join(scratch, "x"), "outside\n");
  const inRepo = (command: string, file = listFile) => {
    const handlers: Record<string, (event: any, ctx?: any) => any> = {};
    benchExtension({ on: (event, handler) => void (handlers[event] = handler) }, file);
    return handlers.tool_call({ type: "tool_call", toolName: "bash", toolCallId: "x", input: { command } }, { cwd: repo });
  };
  for (const command of ["rm ht-check.mjs", "rm -f ht-check.mjs", "rm src/new.mjs tmp/x.mjs", `rm ${join(repo, "ht-check.mjs")}`, "rm -f ht-check.mjs && git status"]) {
    assert.equal(inRepo(command), undefined, command);
  }
  const turnedAway = [
    // The ticket's.
    ...["rm -rf src", "rm src/App.tsx", "rm ../x", "rm *.mjs", "rm -r tmp"],
    // A folder, other options, patterns and braces, what git ignores or keeps, what is not there, a cd first.
    ...["rm tmp", "rm -rf ht-check.mjs", "rm -i ht-check.mjs", "rm -- -f", "rm ht-check.m?s", "rm {ht-check,x}.mjs", "rm ignored.mjs", "rm .git/HEAD", "rm nothing-here.mjs", "rm", "cd src && rm new.mjs", "rm ht-check.mjs src/App.tsx", "rm -f ht-check.mjs &"],
  ];
  for (const command of turnedAway) {
    const result = inRepo(command);
    assert.ok(blocked(result), command);
    assert.match(result.reason, /rm of a file in the project that git does not track/, command);
  }
  // The applying bench's list, as before: no rm, and its reason names none.
  const none = join(scratch, "nothing-here.json");
  assert.ok(blocked(inRepo("rm ht-check.mjs", none)));
  assert.doesNotMatch(inRepo("rm ht-check.mjs", none).reason, /git does not track/);
});
