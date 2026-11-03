import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { AGENTS } from "./agents.ts";
import { DENIED, SHELL } from "./allowlist.ts";
import { INSTALL_SERVERS, INSTALL_SHELL, prepareInstallPi } from "./install-allowlist.ts";
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
  assert.deepEqual(JSON.parse(readFileSync(listFile, "utf8")), { shell: INSTALL_SHELL, servers: INSTALL_SERVERS });
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
