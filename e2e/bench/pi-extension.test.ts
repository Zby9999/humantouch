import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DENIED } from "./allowlist.ts";
import benchExtension from "./pi-extension.ts";

const scratch = mkdtempSync(join(tmpdir(), "03kind-bench-pi-extension-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** The handlers the extension registers, by event, as pi would call them. */
function load(): Record<string, (event: any, ctx?: any) => any> {
  const handlers: Record<string, (event: any, ctx?: any) => any> = {};
  benchExtension({ on: (event, handler) => void (handlers[event] = handler) });
  return handlers;
}

const project = join(scratch, "project");
mkdirSync(join(project, "src"), { recursive: true });
const ctx = { cwd: project };
const call = (toolName: string, input: object) => load().tool_call({ type: "tool_call", toolName, toolCallId: "x", input }, ctx);
const blocked = (result: any) => result?.block === true && typeof result.reason === "string" && result.reason.startsWith(DENIED);

test("in pi, a bash call not on the bench's list is blocked with a reason that starts as the bench counts denials by; one on it, and a read anywhere but pi's own folder, goes ahead", () => {
  const result = call("bash", { command: "npx 03kind claim && curl https://example.com" });
  assert.ok(blocked(result));
  assert.match(result.reason, /curl https:\/\/example\.com$/);

  assert.equal(call("bash", { command: "npx 03kind done 1 && npx 03kind finish" }), undefined);
  assert.equal(call("read", { path: "/etc/hosts" }), undefined);
  assert.equal(call("read", { path: "src/App.tsx" }), undefined);
  assert.equal(call("grep", { pattern: "Card" }), undefined);
  assert.equal(call("ls", {}), undefined);
});

test("in pi, a write or edit outside the project is blocked, by the real path of the nearest folder there is; one inside goes ahead", () => {
  const outside = join(scratch, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(project, "link-out"));

  for (const path of [join(scratch, "x.txt"), "../x.txt", "/tmp/x.txt", "link-out/x.txt", "link-out/new/deep/x.txt", "~/x.txt"]) {
    assert.ok(blocked(call("write", { path, content: "x" })), path);
    assert.ok(blocked(call("edit", { path, edits: [] })), path);
  }
  for (const path of ["src/App.tsx", "src/new/Card.tsx", join(project, "x.txt"), join(realpathSync(project), "src/x.txt"), "@src/App.tsx"]) {
    assert.equal(call("write", { path, content: "x" }), undefined, path);
    assert.equal(call("edit", { path, edits: [] }), undefined, path);
  }
});

test("in pi, no tool reaches pi's own folder, where the designer's login is: by path, by ~, or by a bash argument that names it", () => {
  const pi = join(homedir(), ".pi");
  for (const [tool, input] of [
    ["read", { path: join(pi, "agent/auth.json") }],
    ["read", { path: "~/.pi/agent/auth.json" }],
    ["read", { path: "~/.PI/agent/auth.json" }],
    ["read", { path: `file://${pi}/agent/models.json` }],
    ["ls", { path: "~/.pi" }],
    ["grep", { pattern: "key", path: "~/.pi/agent" }],
    ["grep", { pattern: "key", path: homedir() }],
    ["find", { pattern: "*.json", path: "~" }],
    ["write", { path: "~/.pi/agent/settings.json", content: "{}" }],
  ] as const) {
    assert.ok(blocked(call(tool, input)), `${tool} ${JSON.stringify(input)}`);
  }
  for (const command of [
    "cat ~/.pi/agent/auth.json",
    `cat ${pi}/agent/auth.json`,
    "cat $HOME/.pi/agent/auth.json",
    "cat '~/.pi/agent/auth.json'",
    "cd ~ && cat .pi/agent/auth.json",
    "cd && cat .p*/agent/auth.json",
    "ls ~/.p?",
    "cat ~/.*/agent/auth.json",
    "grep -r key ~",
    "rg key ~",
    "find ~ -name auth.json",
    "cat ../../../../../../../../../.." + pi + "/agent/auth.json",
  ]) {
    assert.ok(blocked(call("bash", { command })), command);
  }
  assert.equal(call("bash", { command: "ls ~" }), undefined);
  assert.equal(call("bash", { command: "cat src/*.tsx" }), undefined);
  assert.equal(call("ls", { path: "~" }), undefined);
});

test("in pi, a cd stays in the project, its folder by its real path, following the cds before it on the line; so a search with no path stays there too", () => {
  mkdirSync(join(scratch, "elsewhere"), { recursive: true });
  symlinkSync(join(scratch, "elsewhere"), join(project, "link-away"));
  for (const command of ["cd .. && ls", "cd /tmp && ls", "cd ~ && grep -r refresh", "cd src && cd ../.. && grep -rn x", "cd link-away && ls", `cd ${scratch} && grep -r key`]) {
    assert.ok(blocked(call("bash", { command })), command);
  }
  for (const command of [`cd ${project} && npx 03kind claim 2>&1`, `cd ${realpathSync(project)} && npx 03kind done 1`, "cd src && ls", "cd src && cd .. && git diff"]) {
    assert.equal(call("bash", { command }), undefined, command);
  }
});

test("in pi, grep's and rg's pattern is no path: / or ~ as a pattern goes ahead; with -e, -f or their long forms every other word is a path, and -f's file is checked", () => {
  for (const command of ['grep -rn "/" src', 'grep -rn "~" src', "rg -n ~ src", "grep -n -A 2 / src/App.tsx", "grep -rn ~", "rg -g '*.tsx' -r y / src", "grep -rn -e / src", "grep -rn --regexp=/ src", "rg --files-with-matches / src"]) {
    assert.equal(call("bash", { command }), undefined, command);
  }
  for (const command of ["grep -rn -e x ~", "rg --regexp x ~", "grep -f ~/.pi/agent/auth.json src", "grep -rf /etc/x ~", "grep -rnf ~/.pi/agent/auth.json src", "rg --file=~/.pi/agent/auth.json src"]) {
    assert.ok(blocked(call("bash", { command })), command);
  }
});

test("in pi, a tool call the extension cannot check is blocked", () => {
  assert.ok(blocked(call("write", { path: 42 })));
  assert.ok(blocked(load().tool_call({ type: "tool_call", toolName: "read", toolCallId: "x", input: null }, ctx)));
});

test("in pi, the instructions files the Agent is given are the project's own, by the real path of their folder: the designer's global AGENTS.md, and any above the project, are left out; the project's, linked from elsewhere, is kept", () => {
  const { before_agent_start } = load();
  const dir = join(scratch, "context");
  const here = join(dir, "project");
  mkdirSync(join(here, "src"), { recursive: true });
  mkdirSync(join(dir, "agent"));
  mkdirSync(join(dir, "shared"));
  writeFileSync(join(dir, "shared/AGENTS.md"), "x");
  symlinkSync(join(dir, "shared/AGENTS.md"), join(here, "AGENTS.md"));
  const files = [join(dir, "agent/AGENTS.md"), join(dir, "AGENTS.md"), join(here, "AGENTS.md"), join(here, "src/CLAUDE.md")];
  for (const file of [files[0], files[1], files[3]]) writeFileSync(file, "x");
  const event = { type: "before_agent_start", systemPromptOptions: { cwd: here, contextFiles: files.map((path) => ({ path, content: "x" })) } };

  before_agent_start(event);

  assert.deepEqual(
    event.systemPromptOptions.contextFiles.map((file) => file.path),
    [join(here, "AGENTS.md"), join(here, "src/CLAUDE.md")],
  );
});

test("in pi, when the instructions files cannot be checked, none is kept but those shown to be the project's", () => {
  const { before_agent_start } = load();
  const event = { type: "before_agent_start", systemPromptOptions: { cwd: join(scratch, "no-such-project"), contextFiles: [{ path: join(scratch, "no-such-project/AGENTS.md"), content: "x" }] } };
  before_agent_start(event);
  assert.deepEqual(event.systemPromptOptions.contextFiles, []);

  const broken = { type: "before_agent_start", systemPromptOptions: { cwd: project, contextFiles: [{ path: join(project, "AGENTS.md") }, { path: null }] } };
  before_agent_start(broken);
  assert.deepEqual(broken.systemPromptOptions.contextFiles, [{ path: join(project, "AGENTS.md") }]);
});

test("in pi, the Skill's undo as `npx 03kind last` prints it goes ahead for the project pi runs in, by its real path or as given; for another folder, or with a patch file, it is blocked", () => {
  const real = realpathSync(project);
  for (const dir of [real, project]) {
    const git = `git -C "${dir}"`;
    assert.equal(call("bash", { command: `${git} diff --binary 1a2b3c 4d5e6f | ${git} apply` }), undefined, dir);
    assert.equal(call("bash", { command: `${git} diff 4d5e6f 1a2b3c` }), undefined, dir);
  }
  const elsewhere = mkdtempSync(join(scratch, "elsewhere-"));
  for (const command of [`git -C "${elsewhere}" diff --binary a b | git -C "${elsewhere}" apply`, `git -C "${real}" diff a b | git -C "${real}" apply x.patch`, `git -C "${real}" apply --unsafe-paths`, `git -C ${join(homedir(), ".pi")} log`]) {
    assert.ok(blocked(call("bash", { command })), command);
  }
});
