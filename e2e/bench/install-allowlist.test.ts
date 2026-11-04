import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { AGENTS } from "./agents.ts";
import { DENIED, SHELL } from "./allowlist.ts";
import { claudeDenied, INSTALL_DENIED_SHELL, INSTALL_SERVERS, INSTALL_SHELL, installClaudeArgs, prepareInstallPi } from "./install-allowlist.ts";
import benchExtension, { INSTALL_LIST } from "./pi-extension.ts";

const scratch = mkdtempSync(join(tmpdir(), "03kind-bench-install-allowlist-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const project = join(scratch, "project");
mkdirSync(join(project, "src"), { recursive: true });
const folder = join(scratch, "run");
mkdirSync(folder);
prepareInstallPi(project, folder);
const extension = AGENTS.pi.args(folder).find((arg) => arg.endsWith("pi-extension.ts"))!;
const listFile = join(dirname(extension), INSTALL_LIST);

/** The extension's tool_call handler, as pi would load it, from `file` for its list. */
function bash(command: string, file = listFile) {
  const handlers: Record<string, (event: any, ctx?: any) => any> = {};
  benchExtension({ on: (event, handler) => void (handlers[event] = handler) }, file);
  return handlers.tool_call({ type: "tool_call", toolName: "bash", toolCallId: "x", input: { command } }, { cwd: project });
}
const blocked = (result: any) => result?.block === true && result.reason.startsWith(DENIED);

test("before pi installs, the extension is copied as for the applying bench and the install list written beside it; pi's command line is the applying bench's", () => {
  assert.ok(existsSync(extension));
  const list = JSON.parse(readFileSync(listFile, "utf8"));
  assert.deepEqual(list.shell, INSTALL_SHELL);
  assert.deepEqual(list.servers, INSTALL_SERVERS);
  assert.deepEqual(list.options, ["--open"]);
  const args = AGENTS.pi.args(folder, "Install 03Kind");
  for (const flag of ["--provider", "--model", "--thinking", "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--skill", "--no-prompt-templates", "--no-themes", "--approve", "--tools"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[1], "Install 03Kind");
});

test("under the install list, pi may run the steps and start a dev server in the background, and nothing denied", () => {
  for (const command of ["npx -y 03kind@latest init", "npx -y file:/tmp/03kind-0.0.0.tgz init", "npx 03kind doctor", "npm install", "pnpm add -D 03kind", "npm run dev &", "npm run dev > /dev/null 2>&1 &", "pnpm dev > dev.log 2>&1 &", "nohup yarn dev > src/../dev.log 2>&1 &", "git status"]) {
    assert.equal(bash(command), undefined, command);
  }
  for (const command of ["rm -rf node_modules", "curl https://example.com", "git push", "kill 123", "pkill -f vite", "sudo npm install", "open http://localhost:5173", "rm -rf src &", "kill 123 &", "npm run dev & rm -rf src", "npm run dev > /tmp/dev.log &", "npm run dev > ../dev.log &", "npm publish", "npm run dev `rm x` &"]) {
    const result = bash(command);
    assert.ok(blocked(result), command);
    assert.match(result.reason, /a dev server started in the background/);
  }
});

test("under the install list, pi's own folder stays out of reach, in the background too", () => {
  for (const command of ["cat ~/.pi/agent/auth.json", "npx vite ~/.pi &", "npm run dev > ~/.pi/agent/log &"]) assert.ok(blocked(bash(command)), command);
});

test("with no install list beside it, the extension holds pi to the applying bench's list, as before", () => {
  const none = join(scratch, "nothing-here.json");
  assert.equal(bash("npx 03kind claim", none), undefined);
  for (const command of ["npm run dev &", "npm install", "npx -y 03kind@latest init", "pnpm dev"]) {
    const result = bash(command, none);
    assert.ok(blocked(result), command);
    assert.ok(result.reason.includes(SHELL.join(", ")));
    assert.doesNotMatch(result.reason, /dev server/);
  }
});

/** What the steps and a designer's install need: every Agent may run these. */
const ALLOWED = [
  "npx -y 03kind@latest init",
  "npx -y file:/tmp/03kind-0.1.0.tgz init",
  "npx 03kind doctor",
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
/** Turned away for every Agent: the denied commands, and the ways round them through npx and the like (the review's bypasses). */
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
];

test("pi, under the install list, runs the steps and turns away the denied commands and every bypass of the review", () => {
  for (const command of ALLOWED) assert.equal(bash(command), undefined, command);
  for (const command of [...DENIED_ALL, "npm exec -- rm -rf src", "npx -p cowsay sh", "yarn exec /bin/rm x", "npm publish", "pnpm remove 03kind", "yarn", "git commit -am x", "python3 -c 1", "npm run dev -- --open &"]) {
    assert.ok(blocked(bash(command)), command);
  }
});

/**
 * Claude Code's permission rules as the tests take them, an approximation:
 * a command line is split at `&&`, `||`, `;`, `|` and a lone `&`, and each
 * command must start with an allowed `Bash(<prefix>:*)`, word by word, and
 * with no denied one; deny wins. Claude Code's own matching parses the shell
 * further (it is not in this repository), so this checks the lists, not it.
 */
function claudeAllows(command: string): boolean {
  const args = installClaudeArgs("/run", "x");
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
  const args = installClaudeArgs("/run", "Install 03Kind");
  const list = (flag: string) => args[args.indexOf(flag) + 1].split(",");
  assert.ok(list("--allowedTools").includes("Bash(npx:*)"));
  assert.ok(list("--allowedTools").includes("Bash(pnpm dev:*)"));
  assert.ok(list("--allowedTools").includes("TaskStop"));
  for (const command of INSTALL_DENIED_SHELL) assert.ok(list("--disallowedTools").includes(`Bash(${command}:*)`), command);
  for (const rule of ["Bash(pnpm exec kill:*)", "Bash(npm exec -c:*)", "Bash(npx -y rm:*)", "Bash(bunx node:*)", "Bash(npx vite --open:*)"]) assert.ok(list("--disallowedTools").includes(rule), rule);
  assert.equal(list("--disallowedTools").length, 2 + claudeDenied().length);
  assert.ok(list("--disallowedTools").includes("WebFetch"));
  const applying = AGENTS.claude.args("/run", "Install 03Kind");
  // Everything else as the applying bench has it.
  for (const [i, arg] of applying.entries()) if (!["--allowedTools", "--disallowedTools"].includes(applying[i - 1])) assert.equal(args[i], arg);
});
