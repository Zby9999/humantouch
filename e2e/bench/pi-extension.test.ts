import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

test("in pi, a bash call not on the bench's list is blocked with a reason that starts as the bench counts denials by; one on it, and every other tool, goes ahead", () => {
  const { tool_call } = load();

  const blocked = tool_call({ type: "tool_call", toolName: "bash", toolCallId: "a", input: { command: "npx 03kind claim && curl https://example.com" } });
  assert.equal(blocked.block, true);
  assert.ok(blocked.reason.startsWith(DENIED));
  assert.match(blocked.reason, /curl https:\/\/example\.com$/);

  assert.equal(tool_call({ type: "tool_call", toolName: "bash", toolCallId: "b", input: { command: "npx 03kind done 1 && npx 03kind finish" } }), undefined);
  assert.equal(tool_call({ type: "tool_call", toolName: "read", toolCallId: "c", input: { path: "/etc/hosts" } }), undefined);
});

test("in pi, the instructions files the Agent is given are the project's own: the designer's global AGENTS.md, and any above the project, are left out", () => {
  const { before_agent_start } = load();
  const project = join(scratch, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  const files = [join(scratch, "agent/AGENTS.md"), join(scratch, "AGENTS.md"), join(project, "AGENTS.md"), join(project, "src/CLAUDE.md")];
  mkdirSync(join(scratch, "agent"));
  for (const file of files) writeFileSync(file, "x");
  const event = { type: "before_agent_start", systemPromptOptions: { cwd: project, contextFiles: files.map((path) => ({ path, content: "x" })) } };

  before_agent_start(event);

  assert.deepEqual(
    event.systemPromptOptions.contextFiles.map((file) => file.path),
    [join(project, "AGENTS.md"), join(project, "src/CLAUDE.md")],
  );
});
