import assert from "node:assert/strict";
import { test } from "node:test";
import { addedLines, checkReport, measureRun, parseTranscript, summarize, toolCallStats, usesVariable, type ToolCall } from "./metrics.ts";

const lines = (...events: object[]) => events.map((event) => JSON.stringify(event)).join("\n");

test("a Claude Code transcript gives its model, each tool call with what it printed, and the last words", () => {
  const transcript = parseTranscript(
    "claude",
    lines(
      { type: "system", subtype: "init", model: "claude-test-1", claude_code_version: "9.9.9" },
      { type: "assistant", message: { content: [{ type: "text", text: "Claiming." }, { type: "tool_use", id: "a", name: "Bash", input: { command: "npx vernierkit claim" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "# Design changes\n" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "b", name: "Read", input: { file_path: "/p/src/App.tsx" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "export function App" }] }] } },
      { type: "result", subtype: "success", result: "✓ Applied\n- 1. Fill", permission_denials: [{ tool_name: "Bash" }] },
    ),
  );

  assert.deepEqual(transcript, {
    model: "claude-test-1",
    toolCalls: [
      { name: "Bash", command: "npx vernierkit claim", output: "# Design changes\n" },
      { name: "Read", path: "/p/src/App.tsx", output: "export function App" },
    ],
    finalText: "✓ Applied\n- 1. Fill",
    permissionDenials: 1,
  });
});

test("a Cursor transcript gives its model, each finished tool call with what it printed, and the last words", () => {
  const transcript = parseTranscript(
    "cursor",
    lines(
      { type: "system", subtype: "init", model: "Composer Test" },
      { type: "tool_call", subtype: "started", call_id: "a", tool_call: { shellToolCall: { args: { command: "npx vernierkit claim" } } } },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "a",
        tool_call: { shellToolCall: { args: { command: "npx vernierkit claim" }, result: { success: { stdout: "# Design changes\n", stderr: "", exitCode: 0 } } } },
      },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "b",
        tool_call: { readToolCall: { args: { path: "src/App.tsx" }, result: { success: { content: "export function App", totalLines: 1 } } } },
      },
      { type: "tool_call", subtype: "completed", call_id: "c", tool_call: { grepToolCall: { args: { pattern: "Card" }, result: { error: { message: "no" } } } } },
      { type: "assistant", message: { content: [{ type: "text", text: "✓ Applied" }] } },
      { type: "result", subtype: "success", result: "Claiming.✓ Applied" },
    ),
  );

  assert.deepEqual(transcript, {
    model: "Composer Test",
    toolCalls: [
      { name: "shell", command: "npx vernierkit claim", output: "# Design changes\n" },
      { name: "read", path: "src/App.tsx", output: "export function App" },
      { name: "grep", output: '{"error":{"message":"no"}}' },
    ],
    finalText: "✓ Applied",
    permissionDenials: 0,
  });
});

test("tool calls are counted: searches over the project, the command line's commands, and what the Agent read, the Skill and claim apart", () => {
  const calls: ToolCall[] = [
    { name: "Skill", skill: "vernierkit", output: "S".repeat(30) },
    { name: "Read", path: "/p/.agents/skills/vernierkit/SKILL.md", output: "K".repeat(14) },
    { name: "Bash", command: "npx vernierkit claim", output: "notes!" },
    { name: "Bash", command: "cd /p && npx vernierkit claim", output: "again" },
    { name: "Grep", output: "src/App.tsx:3" },
    { name: "Grep", path: "/p/src", output: "" },
    { name: "Grep", path: "/p/src/App.tsx", output: "" },
    { name: "Glob", output: "" },
    { name: "Bash", command: 'rg "bg-white" src', output: "" },
    { name: "Bash", command: "grep -rn Card src/", output: "" },
    { name: "Bash", command: "grep -n Card src/App.tsx", output: "" },
    { name: "Bash", command: "find . -name '*.css'", output: "" },
    { name: "Bash", command: "npx vernierkit done 1", output: "Change 1 done" },
    { name: "Bash", command: "npx vernierkit done 2 && npx vernierkit finish", output: "Round finished" },
  ];

  assert.deepEqual(toolCallStats(calls), {
    toolCalls: 14,
    repoWideSearches: 6,
    claims: 2,
    dones: 2,
    finished: true,
    charsRead: { skill: 44, claim: 11, total: 44 + 11 + 13 + 13 + 14 },
  });
});

test("in Claude Code, a Skill's text comes as a message after the Skill tool's answer: it is what that call read", () => {
  const transcript = parseTranscript(
    "claude",
    lines(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "s", name: "Skill", input: { skill: "vernierkit" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "s", content: "Launching skill: vernierkit" }] } },
      { type: "user", message: { content: [{ type: "text", text: "Base directory for this skill: /p\n\n# Applying" }] } },
    ),
  );

  assert.deepEqual(transcript.toolCalls, [{ name: "Skill", skill: "vernierkit", output: "Launching skill: vernierkitBase directory for this skill: /p\n\n# Applying" }]);
});

test("a report in the Skill's form lists each change once, under ✓ or under ⚠️ with why and instead", () => {
  const report = [
    "Done. Here is the report:",
    "```",
    "✓ Applied",
    "- 1. Fill: the cards, white → red",
    "- 3. Brief on Button: springs back",
    "",
    "⚠️ Not applied 1:1",
    "- 2. Corner radius: the badge",
    "  Why: the library sets it",
    "  Instead: left as it was",
    "```",
  ].join("\n");

  assert.deepEqual(checkReport(report, [1, 2, 3]), { compliant: true, applied: [1, 3], notApplied: [2], problems: [] });
});

test("a report missing a change, listing one twice, or a ⚠️ with no why, is not in the form; with no ✓ there is no report", () => {
  const report = ["✓ 已落地", "- 1. 填充", "- 1. 填充", "⚠️ 无法 1:1 落地", "- 2. 圆角", "  原因：组件库写死了"].join("\n");

  assert.deepEqual(checkReport(report, [1, 2, 3]), {
    compliant: false,
    applied: [1],
    notApplied: [2],
    problems: ["change 1 listed more than once", "change 2 under ⚠️ without both why and instead", "change 3 not listed"],
  });
  assert.deepEqual(checkReport("All done!", [1]), { compliant: false, applied: [], notApplied: [], problems: ["no ✓ section"] });
});

test("a run is measured from claim to finish: per change, against the page's checks and what the page shows, and by its longest wait for progress", () => {
  const run = measureRun({
    changes: [
      { id: 1, checkable: true, shown: true },
      { id: 2, checkable: true, shown: false },
      { id: 3, checkable: false, shown: null },
      { id: 4, checkable: true, shown: true },
    ],
    checks: { 1: { outcome: "shown" }, 2: { outcome: "shown" }, 3: { outcome: "unchecked" } },
    report: { compliant: true, applied: [1, 2, 3], notApplied: [4], problems: [] },
    times: { claim: 1000, finish: 41000, end: 45000, progress: [5000, 30000, 12000, 31000] },
  });

  assert.deepEqual(run, {
    applyMs: 40000,
    applyMsPerChange: 10000,
    checked: 2,
    oneToOneByChecks: 2 / 3,
    oneToOneByPage: 2 / 3,
    falseChecks: [2],
    maxProgressGapMs: 18000,
  });
});

test("with no finish, the round is measured to the Agent's end; with nothing to check, there is no rate", () => {
  const run = measureRun({
    changes: [{ id: 1, checkable: false, shown: null }],
    checks: {},
    report: { compliant: false, applied: [], notApplied: [], problems: ["no ✓ section"] },
    times: { claim: 0, finish: null, end: 9000, progress: [] },
  });

  assert.deepEqual(run, { applyMs: 9000, applyMsPerChange: 9000, checked: 0, oneToOneByChecks: null, oneToOneByPage: null, falseChecks: [], maxProgressGapMs: 9000 });
});

test("runs are summed up by their median and range; a run with no value is left out", () => {
  assert.deepEqual(summarize([3, null, 1, 10, 2]), { median: 2.5, min: 1, max: 10, n: 4 });
  assert.deepEqual(summarize([5, 1, 3]), { median: 3, min: 1, max: 5, n: 3 });
  assert.deepEqual(summarize([null]), { median: null, min: null, max: null, n: 0 });
});

test("a Variable counts as used when a line the Agent added writes its class, with any variant, or its CSS variable", () => {
  const diff = [
    "--- a/src/App.tsx",
    "+++ b/src/App.tsx",
    '-  <h1 className="text-4xl">',
    '+  <h1 className="md:text-5xl!">',
    "+  border-radius: var(--radius-lg);",
    "   gap-3 unchanged",
  ].join("\n");
  const added = addedLines(diff);

  assert.equal(usesVariable(added, ["text-5xl"]), true);
  assert.equal(usesVariable(added, ["rounded-lg", "--radius-lg"]), true);
  assert.equal(usesVariable(added, ["text-4xl"]), false);
  assert.equal(usesVariable(added, ["gap-3"]), false);
  assert.equal(usesVariable(added, ["text-5"]), false);
});
