import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DENIED } from "./allowlist.ts";
import { checkReport, fffProblem, isRepoWideSearch, measureRun, parseTranscript, pooled, reportedAsExpected, scenarioExpectationsHold, summarize, toolCallStats, usesVariable, type ToolCall } from "./metrics.ts";

const lines = (...events: object[]) => events.map((event) => JSON.stringify(event)).join("\n");

test("a Claude Code transcript gives its model, the skills it was given, each tool call with what it printed, the last words, and how often the API had to be asked again", () => {
  const transcript = parseTranscript(
    "claude",
    lines(
      { type: "system", subtype: "init", model: "claude-test-1", claude_code_version: "9.9.9", skills: ["03kind", "debug"] },
      { type: "assistant", message: { content: [{ type: "text", text: "Claiming." }, { type: "tool_use", id: "a", name: "Bash", input: { command: "npx 03kind claim" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "# Design changes\n" }] } },
      { type: "system", subtype: "api_retry", attempt: 1, no_response: { waited_ms: 181000 } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "b", name: "Read", input: { file_path: "/p/src/App.tsx" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "export function App" }] }] } },
      { type: "result", subtype: "success", result: "✓ Applied\n- 1. Fill", permission_denials: [{ tool_name: "Bash" }] },
    ),
  );

  assert.deepEqual(transcript, {
    model: "claude-test-1",
    responseModels: [],
    skills: ["03kind", "debug"],
    tools: [],
    fffTools: [],
    toolCalls: [
      { name: "Bash", command: "npx 03kind claim", output: "# Design changes\n" },
      { name: "Read", path: "/p/src/App.tsx", output: "export function App" },
    ],
    finalText: "✓ Applied\n- 1. Fill",
    permissionDenials: 1,
    subagents: { calls: 0, models: [] },
    apiRetries: 1,
  });
});

test("a Cursor transcript gives its model, each finished tool call with what it printed (or, for a long file read, its size), and the last words", () => {
  const transcript = parseTranscript(
    "cursor",
    lines(
      { type: "system", subtype: "init", model: "Composer Test" },
      { type: "tool_call", subtype: "started", call_id: "a", tool_call: { shellToolCall: { args: { command: "npx 03kind claim" } } } },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "a",
        tool_call: { shellToolCall: { args: { command: "npx 03kind claim" }, result: { success: { stdout: "# Design changes\n", stderr: "", exitCode: 0 } } } },
      },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "b",
        tool_call: { readToolCall: { args: { path: "src/App.tsx" }, result: { success: { content: "export function App", totalLines: 1 } } } },
      },
      { type: "tool_call", subtype: "completed", call_id: "c", tool_call: { grepToolCall: { args: { pattern: "Card" }, result: { error: { message: "no" } } } } },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "d",
        tool_call: { readToolCall: { args: { path: ".claude/skills/03kind/SKILL.md" }, result: { success: { isEmpty: false, totalLines: 147, fileSize: 24653 } } } },
      },
      { type: "assistant", message: { content: [{ type: "text", text: "✓ Applied" }] } },
      { type: "result", subtype: "success", result: "Claiming.✓ Applied" },
    ),
  );

  assert.deepEqual(transcript, {
    model: "Composer Test",
    responseModels: [],
    skills: [],
    tools: [],
    fffTools: [],
    toolCalls: [
      { name: "shell", command: "npx 03kind claim", output: "# Design changes\n" },
      { name: "read", path: "src/App.tsx", output: "export function App" },
      { name: "grep", output: '{"error":{"message":"no"}}' },
      { name: "read", path: ".claude/skills/03kind/SKILL.md", output: "", size: 24653 },
    ],
    finalText: "✓ Applied",
    permissionDenials: 0,
    subagents: { calls: 0, models: [] },
    apiRetries: 0,
  });
});

test("a pi transcript (--mode json) gives its provider and model, the model the provider answered with, the skills its system prompt lists, each tool call with what it got back, and the last words", () => {
  // Cut from a real run (85-real-pi, button-over-rule), its long outputs shortened and its run folder made /t/run.
  const transcript = parseTranscript("pi", readFileSync(new URL("./fixtures/pi.jsonl", import.meta.url), "utf8"));

  assert.equal(transcript.model, "command-code/deepseek/deepseek-v4.1-flash");
  assert.deepEqual(transcript.responseModels, ["deepseek/deepseek-v4.1-flash-1017-cm"]);
  assert.deepEqual(transcript.skills, ["03kind"]);
  // That run's tools, before the review took find out (ticket 85) and before fff (ticket 92).
  assert.deepEqual(transcript.tools, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  assert.deepEqual(
    transcript.toolCalls.map(({ output, ...call }) => call),
    [
      { name: "read", path: "/t/run/.agents/skills/03kind/SKILL.md" },
      { name: "bash", command: "cd /t/run && npx 03kind claim 2>&1" },
      { name: "read", path: "/t/run/src/App.tsx" },
      { name: "read", path: "/t/run/src/index.css" },
      { name: "read", path: "/t/run/src/components/Dialog.tsx" },
      { name: "edit", path: "/t/run/src/App.tsx" },
      { name: "bash", command: "cd /t/run && npx 03kind done 1 2 2>&1" },
      { name: "bash", command: "cd /t/run && npx 03kind finish 2>&1" },
    ],
  );
  assert.match(transcript.toolCalls[0].output, /^---\nname: 03kind\n/);
  assert.equal(transcript.toolCalls[5].output, "Successfully replaced 1 block(s) in /t/run/src/App.tsx.");
  assert.match(transcript.toolCalls[6].output, /^Changes 1 and 2 done: 2 of 2 changes applied\./);
  assert.match(transcript.finalText, /^Applied both changes/);
  assert.deepEqual({ permissionDenials: transcript.permissionDenials, subagents: transcript.subagents, apiRetries: transcript.apiRetries }, { permissionDenials: 0, subagents: { calls: 0, models: [] }, apiRetries: 0 });
  assert.deepEqual(
    { ...toolCallStats(transcript.toolCalls), charsRead: undefined },
    { toolCalls: 8, repoWideSearches: 0, claims: 1, dones: 1, finished: true, packageReads: 0, charsRead: undefined },
  );
  assert.equal(toolCallStats(transcript.toolCalls).charsRead.skill, transcript.toolCalls[0].output.length);
  assert.equal(checkReport(transcript.finalText, [1, 2]).compliant, true);
});

test("a pi transcript with fff (--fff-mode override) declares fff's grep and find under the names of pi's own, told apart by their parameters; calls to other tools are not fff's (ticket 92)", () => {
  // Cut from a real run (92-real-pi, button-over-rule), its long texts shortened, its run folder made /t/run, pi's docs and rules left out.
  // The Agent called no search tool of fff's: claim says where each change goes.
  const transcript = parseTranscript("pi", readFileSync(new URL("./fixtures/pi-fff.jsonl", import.meta.url), "utf8"));

  assert.deepEqual(transcript.tools, ["read", "bash", "edit", "write", "ls", "grep", "find"]);
  assert.deepEqual(transcript.fffTools, ["grep", "find"]);
  assert.equal(transcript.model, "command-code/deepseek/deepseek-v4.1-flash");
  assert.deepEqual(transcript.skills, ["03kind"]);
  assert.deepEqual(
    transcript.toolCalls.map(({ output, ...call }) => call),
    [
      { name: "read", path: "/t/run/.agents/skills/03kind/SKILL.md" },
      { name: "bash", command: "cd /t/run && npx 03kind claim 2>&1" },
      { name: "read", path: "/t/run/src/App.tsx" },
      { name: "read", path: "/t/run/src/index.css" },
      { name: "bash", command: 'cd /t/run && grep -rn "<button" src/ | head -20' },
      { name: "edit", path: "/t/run/src/App.tsx" },
      { name: "bash", command: "cd /t/run && npx 03kind done 1 2 2>&1" },
      { name: "bash", command: "cd /t/run && npx 03kind finish 2>&1" },
    ],
  );
  const stats = toolCallStats(transcript.toolCalls);
  // The shell's grep -r, the one search over the project.
  assert.deepEqual([stats.toolCalls, stats.repoWideSearches, stats.claims, stats.dones, stats.finished], [8, 1, 1, 1, true]);
  assert.equal(fffProblem({ "pi-fff": "0.11.0" }, transcript), null);
});

test("fff's calls in a pi transcript are fff's, with their path, and count as searches over the project unless held to one file (ticket 92)", () => {
  // SYNTHETIC: no real run has called fff's tools yet. The declarations and arguments follow pi-fff 0.11.0's source
  // (src/index.ts: grepSchema, findSchema, in override mode), the events pi.jsonl.
  const fffGrep = { name: "grep", description: "Grep file contents. Smart-case, auto-detects regex vs literal, git-aware.", parameters: { type: "object", required: ["pattern"], properties: { pattern: {}, path: {}, exclude: {}, caseSensitive: {}, context: {}, limit: {}, cursor: {} } } };
  const fffFind = { name: "find", description: "Fuzzy path search and glob search.", parameters: { type: "object", required: ["pattern"], properties: { pattern: {}, path: {}, exclude: {}, limit: {}, cursor: {} } } };
  const calls = [
    ["grep", { pattern: "Open dialog" }],
    ["find", { pattern: "Dialog" }],
    ["grep", { pattern: "rounded-lg", path: "src/components/Dialog.tsx", context: 1 }],
    ["grep", { pattern: "--color-brand", path: "*.css" }],
    ["find", { pattern: "", path: "src/v1.2", exclude: "test/" }],
  ] as const;
  const transcript = parseTranscript(
    "pi",
    lines(
      { type: "message_end", message: { role: "system", content: "", sections: {}, toolsAdded: [{ name: "read", parameters: { properties: { path: {} } } }, fffGrep, fffFind] } },
      ...calls.map(([name, args], i) => ({ type: "message_end", message: { role: "assistant", provider: "command-code", model: "m", content: [{ type: "toolCall", id: `c${i}`, name, arguments: args }] } })),
    ),
  );

  assert.deepEqual(transcript.fffTools, ["grep", "find"]);
  assert.deepEqual(
    transcript.toolCalls.map(({ output, ...call }) => call),
    [
      { name: "grep", fff: true },
      { name: "find", fff: true },
      { name: "grep", fff: true, path: "src/components/Dialog.tsx" },
      { name: "grep", fff: true, path: "*.css" },
      { name: "find", fff: true, path: "src/v1.2" },
    ],
  );
  assert.deepEqual(transcript.toolCalls.map(isRepoWideSearch), [true, true, false, true, true]);
});

test("a run that had pi-fff whose transcript declares grep or find not as fff's (or no tool of fff's) is a problem the bench stops on; a run with no pi-fff (before ticket 92) is none", () => {
  const declared = (...tools: [string, string[]][]) =>
    parseTranscript("pi", lines({ type: "message_end", message: { role: "system", content: "", sections: {}, toolsAdded: tools.map(([name, keys]) => ({ name, parameters: { properties: Object.fromEntries(keys.map((key) => [key, {}])) } })) } }));
  const piOwn: [string, string[]][] = [["grep", ["pattern", "path", "glob", "ignoreCase", "literal", "context", "limit"]], ["find", ["pattern", "path", "limit"]]];
  const fff: [string, string[]][] = [["grep", ["pattern", "path", "exclude", "caseSensitive", "context", "limit", "cursor"]], ["find", ["pattern", "path", "exclude", "limit", "cursor"]]];

  assert.equal(fffProblem({ "pi-fff": "0.11.0" }, declared(["read", ["path"]], ...fff)), null);
  assert.match(fffProblem({ "pi-fff": "0.11.0" }, declared(["read", ["path"]], ...piOwn))!, /pi-fff 0\.11\.0.*grep, find/);
  assert.match(fffProblem({ "pi-fff": "0.11.0" }, declared(fff[0], piOwn[1]))!, /find/);
  assert.match(fffProblem({ "pi-fff": "0.11.0" }, declared(["read", ["path"]]))!, /no tool of fff's/);
  assert.equal(fffProblem({}, declared(...piOwn)), null);
  assert.equal(fffProblem(undefined, declared(...piOwn)), null);
  // fff's own names, which it falls back on, are its own.
  assert.equal(fffProblem({ "pi-fff": "0.11.0" }, declared(["ffgrep", ["pattern", "path", "exclude", "cursor"]], ["fffind", ["pattern", "path"]])), null);
});

test("fff's searches are over the project, or a folder of it, unless held to one file: with no path, a folder, a glob, several constraints or one left out, they are; with one file's path, they are not; pi's own grep with a path like a file's is as before (ticket 92)", () => {
  const search = (name: string, path?: string): ToolCall => ({ name, ...(path === undefined ? {} : { path }), output: "" });
  const fff = (name: string, path?: string): ToolCall => ({ ...search(name, path), fff: true });
  for (const call of [
    fff("grep"),
    fff("grep", "src/"),
    fff("grep", "*.tsx"),
    fff("grep", "src/**/*.tsx"),
    fff("find"),
    fff("find", "src/components/"),
    fff("find", "**/*.css"),
    // A folder to fff, whose file names end in a letter, then letters or digits.
    fff("find", "src/v1.2"),
    fff("grep", "src/2024.10"),
    search("ffgrep"),
    search("ffgrep", "src/"),
    search("ffgrep", "src"),
    search("ffgrep", "*.tsx"),
    search("ffgrep", "src/**/*.tsx"),
    search("ffgrep", "{src,lib}/**"),
    search("ffgrep", "~/Desktop"),
    search("fffind"),
    search("fffind", "src/components/"),
    search("fff-multi-grep"),
    search("fff-multi-grep", "*.{ts,tsx} !test/"),
    search("fff-multi-grep", "src/App.tsx src/index.css"),
    search("fff-multi-grep", "!src/App.tsx"),
    search("multi_grep"),
  ]) {
    assert.ok(isRepoWideSearch(call), JSON.stringify(call));
  }
  for (const call of [
    search("ffgrep", "src/App.tsx"),
    search("ffgrep", "App.tsx"),
    search("fffind", "/t/run/src/index.css"),
    search("fff-multi-grep", "src/App.tsx"),
    fff("grep", "src/App.tsx"),
    fff("find", "App.tsx"),
    fff("grep", "config.json5"),
    // pi's own grep (the runs before ticket 92) takes no glob as path: one with an extension is a file.
    search("grep", "*.tsx"),
    search("grep", "/t/run/src/App.tsx"),
  ]) {
    assert.equal(isRepoWideSearch(call), false, JSON.stringify(call));
  }
});

test("fff-multi-grep's constraints are the path it searches, as far as the bench looks: one into the 03Kind package reads it", () => {
  const transcript = parseTranscript(
    "pi",
    lines({ type: "message_end", message: { role: "assistant", provider: "command-code", model: "m", content: [{ type: "toolCall", id: "a", name: "fff-multi-grep", arguments: { patterns: ["claim"], constraints: "node_modules/03kind/" } }] } }),
  );

  assert.deepEqual(transcript.toolCalls.map(({ output, ...call }) => call), [{ name: "fff-multi-grep", path: "node_modules/03kind/" }]);
  assert.equal(toolCallStats(transcript.toolCalls).packageReads, 1);
});

test("in a pi transcript, a call the bench's extension blocked is a permission denial, and a retry of the API is counted", () => {
  const transcript = parseTranscript(
    "pi",
    lines(
      { type: "message_end", message: { role: "assistant", provider: "command-code", model: "m", content: [{ type: "toolCall", id: "a", name: "bash", arguments: { command: "rm -rf src" } }] } },
      { type: "message_end", message: { role: "toolResult", toolCallId: "a", toolName: "bash", content: [{ type: "text", text: `${DENIED} only these shell commands … Turned away: rm -rf src` }], isError: true } },
      { type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "529 overloaded" },
      { type: "message_end", message: { role: "toolResult", toolCallId: "b", toolName: "bash", content: [{ type: "text", text: "Not found" }], isError: true } },
    ),
  );

  assert.equal(transcript.permissionDenials, 1);
  assert.equal(transcript.apiRetries, 1);
  assert.match(transcript.toolCalls[0].output, /Turned away: rm -rf src$/);
});

test("a pi transcript with an answer from another model than its first names both, a model no Agent is pinned to: pi starts no subagent, so it is a switch, and the bench stops on it", () => {
  const assistant = (model: string, text: string) => ({ type: "message_end", message: { role: "assistant", provider: "command-code", model, content: [{ type: "text", text }], stopReason: "stop" } });

  const transcript = parseTranscript("pi", lines(assistant("main", "a"), assistant("other", "b"), assistant("main", "c")));

  assert.equal(transcript.model, "command-code/main, command-code/other");
  assert.deepEqual(transcript.subagents, { calls: 0, models: [] });
  assert.equal(transcript.finalText, "c");
  assert.equal(parseTranscript("pi", lines(assistant("main", "a"), assistant("main", "b"))).model, "command-code/main");
});

test("tool calls are counted: searches over the project, the command line's commands, and what the Agent read, the Skill (loaded, read, or printed in the shell) and claim apart", () => {
  const calls: ToolCall[] = [
    { name: "Skill", skill: "03kind", output: "S".repeat(30) },
    { name: "Read", path: "/p/.agents/skills/03kind/SKILL.md", output: "", size: 14 },
    { name: "Bash", command: "npx 03kind claim", output: "notes!" },
    { name: "Bash", command: "cd /p && npx 03kind claim", output: "again" },
    { name: "Grep", output: "src/App.tsx:3" },
    { name: "Grep", path: "/p/src", output: "" },
    { name: "Grep", path: "/p/src/App.tsx", output: "" },
    { name: "Glob", output: "" },
    { name: "Bash", command: 'rg "bg-white" src', output: "" },
    { name: "Bash", command: "grep -rn Card src/", output: "" },
    { name: "Bash", command: "grep -n Card src/App.tsx", output: "" },
    { name: "Bash", command: "find . -name '*.css'", output: "" },
    { name: "Bash", command: "npx 03kind done 1", output: "Change 1 done" },
    { name: "Bash", command: "npx 03kind done 2 && npx 03kind finish", output: "Round finished" },
    { name: "shell", command: "cat .agents/skills/03kind/SKILL.md", output: "C".repeat(20) },
  ];

  assert.deepEqual(toolCallStats(calls), {
    toolCalls: 15,
    repoWideSearches: 6,
    claims: 2,
    dones: 2,
    finished: true,
    packageReads: 0,
    charsRead: { skill: 64, claim: 11, total: 64 + 11 + 13 + 13 + 14 },
  });
});

test("in Claude Code, a Skill's text comes as a message after the Skill tool's answer: it is what that call read", () => {
  const transcript = parseTranscript(
    "claude",
    lines(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "s", name: "Skill", input: { skill: "03kind" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "s", content: "Launching skill: 03kind" }] } },
      { type: "user", message: { content: [{ type: "text", text: "Base directory for this skill: /p\n\n# Applying" }] } },
    ),
  );

  assert.deepEqual(transcript.toolCalls, [{ name: "Skill", skill: "03kind", output: "Launching skill: 03kindBase directory for this skill: /p\n\n# Applying" }]);
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

test("a report missing a change, listing one twice, or a ⚠️ with no why, is not in the form; with neither ✓ nor ⚠️ there is no report", () => {
  const report = ["✓ 已落地", "- 1. 填充", "- 1. 填充", "⚠️ 无法 1:1 落地", "- 2. 圆角", "  原因：组件库写死了"].join("\n");

  assert.deepEqual(checkReport(report, [1, 2, 3]), {
    compliant: false,
    applied: [1],
    notApplied: [2],
    problems: ["change 1 listed more than once", "change 2 under ⚠️ without both why and instead", "change 3 not listed"],
  });
  assert.deepEqual(checkReport("All done!", [1]), { compliant: false, applied: [], notApplied: [], problems: ["no ✓ or ⚠️ section"] });
});

test("a report with every change under ⚠️ and no ✓ section is in the form", () => {
  const report = ["⚠️ Not applied 1:1", "- 1. Fill: the cards", "  Why: the data comes from an API", "  Instead: left as it was"].join("\n");

  assert.deepEqual(checkReport(report, [1]), { compliant: true, applied: [], notApplied: [1], problems: [] });
});

test("a run is measured from claim to finish: per change, against the page's checks and what the page shows, by its longest wait between two bits of progress, and by its longest time with no progress and no edit", () => {
  const run = measureRun({
    changes: [
      { id: 1, checkable: true, shown: true },
      { id: 2, checkable: true, shown: false },
      { id: 3, checkable: false, shown: null },
      { id: 4, checkable: true, shown: true },
    ],
    checks: { 1: { outcome: "shown" }, 2: { outcome: "shown" }, 3: { outcome: "unchecked" } },
    report: { compliant: true, applied: [1, 2, 3], notApplied: [4], problems: [] },
    times: { claim: 1000, finish: 41000, end: 45000, progress: [5000, 30000, 12000, 31000], edits: [20000, 3000] },
  });

  assert.deepEqual(run, {
    applyMs: 40000,
    applyMsPerChange: 10000,
    checked: 2,
    oneToOneByChecks: 2 / 3,
    oneToOneByPage: 2 / 3,
    oneToOneCounts: { byChecks: { part: 2, whole: 3 }, byPage: { part: 2, whole: 3 } },
    falseChecks: [2],
    maxProgressGapMs: 18000,
    maxStillMs: 10000,
  });
});

test("with no finish, the round is measured to the Agent's end; with nothing to check, there is no rate", () => {
  const run = measureRun({
    changes: [{ id: 1, checkable: false, shown: null }],
    checks: {},
    report: { compliant: false, applied: [], notApplied: [], problems: ["no ✓ section"] },
    times: { claim: 0, finish: null, end: 9000, progress: [], edits: [] },
  });

  assert.deepEqual(run, { applyMs: 9000, applyMsPerChange: 9000, checked: 0, oneToOneByChecks: null, oneToOneByPage: null, oneToOneCounts: { byChecks: { part: 0, whole: 0 }, byPage: { part: 0, whole: 0 } }, falseChecks: [], maxProgressGapMs: null, maxStillMs: 9000 });
});

test("runs are summed up by their median and range; a run with no value is left out", () => {
  assert.deepEqual(summarize([3, null, 1, 10, 2]), { median: 2.5, min: 1, max: 10, n: 4 });
  assert.deepEqual(summarize([5, 1, 3]), { median: 3, min: 1, max: 5, n: 3 });
  assert.deepEqual(summarize([null]), { median: null, min: null, max: null, n: 0 });
});

test("a Variable counts as used when the lines the Agent added write its class, with any variant, or its CSS variable", () => {
  const diff = [
    "--- a/src/App.tsx",
    "+++ b/src/App.tsx",
    '-  <h1 className="text-4xl">',
    '+  <h1 className="md:text-5xl!">',
    "+  border-radius: var(--radius-lg);",
    "   gap-3 unchanged",
  ].join("\n");
  assert.equal(usesVariable(diff, ["text-5xl"]), true);
  assert.equal(usesVariable(diff, ["rounded-lg", "--radius-lg"]), true);
  assert.equal(usesVariable(diff, ["text-4xl"]), false);
  assert.equal(usesVariable(diff, ["gap-3"]), false);
  assert.equal(usesVariable(diff, ["text-5"]), false);
});

test("a rate over runs is pooled: their parts over their wholes, not a run's rate in the middle; runs with none are left out", () => {
  assert.deepEqual(pooled([{ part: 1, whole: 4 }, { part: 1, whole: 1 }, { part: 2, whole: 2 }, null]), { rate: 4 / 7, part: 4, whole: 7 });
  assert.deepEqual(pooled([null, { part: 0, whole: 0 }]), { rate: null, part: 0, whole: 0 });
});

test("a value of several parts, each its own Variable, counts as using them when every part is written, each by one of its names; a flat list is any one of it", () => {
  const diff = ['-  <button className="px-4 py-2">', '+  <button className="pt-3 pr-6 pb-1 pl-[8px]">'].join("\n");
  const padding = [["pt-3"], ["pr-6"], ["pb-1"], ["pl-2", "--spacing-2"]];

  assert.equal(usesVariable(diff, padding), false);
  assert.equal(usesVariable(diff.replace("pl-[8px]", "pl-2"), padding), true);
  assert.equal(usesVariable(diff, ["pt-3", "pl-2"]), true);
});

test("a Variable only carried along in a line the Agent rewrote for another change is not counted as used", () => {
  const diff = ['-  <h1 className="text-stone-900">Title</h1>', "+  <div>", '+    <h1 className="text-stone-900">Title</h1>', '+  <p className="text-[#1c1917]">'].join("\n");

  assert.equal(usesVariable(diff, ["text-stone-900"]), false);
});

test("subagents are counted apart: Claude Code's Task or Agent calls and the other models its result names; Cursor's task calls and the models its events name besides the main one", () => {
  const claude = parseTranscript(
    "claude",
    lines(
      { type: "system", subtype: "init", model: "main-model" },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "a", name: "Task", input: { prompt: "look" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "found" }] } },
      { type: "result", result: "", modelUsage: { "main-model": {}, "small-model": {} } },
    ),
  );
  assert.deepEqual(claude.subagents, { calls: 1, models: ["small-model"] });

  const cursor = parseTranscript(
    "cursor",
    lines(
      { type: "system", subtype: "init", model: "Grok Test" },
      { type: "tool_call", subtype: "completed", tool_call: { taskToolCall: { args: { description: "explore" }, result: { success: { model: "Composer 2.5" } } } } },
      { type: "assistant", model: "Composer 2.5", message: { content: [{ type: "text", text: "sub" }] } },
    ),
  );
  assert.deepEqual(cursor.subagents, { calls: 1, models: ["Composer 2.5"] });
});

test("the Skill read from the package's own copy, as an Agent with none in the project may find it, is the Skill read too (ticket 65)", () => {
  const calls: ToolCall[] = [
    { name: "Read", path: "/p/node_modules/03kind/skill/SKILL.md", output: "S".repeat(12) },
    { name: "Bash", command: "cat node_modules/03kind/skill/SKILL.md", output: "C".repeat(5) },
    { name: "Read", path: "/p/src/skill/SKILL.md", output: "x" },
  ];

  assert.equal(toolCallStats(calls).charsRead.skill, 17);
});

test("calls that read the 03Kind package itself are counted, not those that run its command line (ticket 65)", () => {
  const calls: ToolCall[] = [
    { name: "read", path: "/t/run/node_modules/03kind/dist/cli.js", output: "x" },
    { name: "grep", path: "/t/run/node_modules/.pnpm/03kind@file+..+pack/node_modules/03kind/dist", output: "" },
    { name: "shell", command: "node -e 'require(\"fs\").readFileSync(\"node_modules/03kind/dist/editor.dev.js\")'", output: "" },
    { name: "Read", path: "/p/node_modules/03kind/skill/SKILL.md", output: "" },
    { name: "Bash", command: "npx 03kind done 1", output: "" },
    { name: "Bash", command: "node node_modules/03kind/dist/cli.js claim", output: "" },
    { name: "Read", path: "/p/node_modules/03kindred/index.js", output: "" },
    { name: "Read", path: "/p/src/App.tsx", output: "" },
  ];

  assert.equal(toolCallStats(calls).packageReads, 4);
});

test("Cursor's glob in a folder of the package is a call there, by its target folder (ticket 65)", () => {
  const transcript = parseTranscript(
    "cursor",
    lines({ type: "tool_call", subtype: "completed", tool_call: { globToolCall: { args: { targetDirectory: "/t/node_modules/03kind", globPattern: "**/*" }, result: { success: { content: "" } } } } }),
  );

  assert.equal(transcript.toolCalls[0].folder, "/t/node_modules/03kind");
  assert.equal(toolCallStats(transcript.toolCalls).packageReads, 1);
});

test("changes that cannot be applied 1:1 are counted as reported right when the report lists them under ⚠️ with why and instead; none expected, no rate (ticket 86)", () => {
  const report = checkReport(
    ["✓ Applied", "- 1. Fill: the Grid, stone-100", "", "⚠️ Not applied 1:1", "- 2. Width: Badge", "  Why: acme-ui sets it", "  Instead: left as it was", "- 3. Width: Badge", "  Why: acme-ui sets it"].join("\n"),
    [1, 2, 3, 4],
  );

  const notShown = (...ids: number[]) => ids.map((id) => ({ id, shown: false }));
  assert.equal(reportedAsExpected(report, notShown(2)), 1);
  // Under ⚠️ without both lines, or under ✓ with the page not showing it, or not listed at all, it is not.
  assert.equal(reportedAsExpected(report, notShown(3)), 0);
  assert.equal(reportedAsExpected(report, notShown(1, 2)), 0.5);
  assert.equal(reportedAsExpected(report, notShown(4)), 0);
  assert.equal(reportedAsExpected(report, []), null);
});

test("a change that cannot be applied 1:1 listed under ✓ is reported right when the page shows it after all, and a false ✓ when it does not; it is in no 1:1 rate (ticket 86)", () => {
  const report = checkReport(["✓ Applied", "- 1. Fill: the Grid, stone-100", "- 2. Width: Badge, 90px by its parent"].join("\n"), [1, 2]);

  assert.equal(reportedAsExpected(report, [{ id: 2, shown: true }]), 1);
  assert.equal(reportedAsExpected(report, [{ id: 2, shown: false }]), 0);
  // A run from before the change had a test of its own: not shown is not known.
  assert.equal(reportedAsExpected(report, [{ id: 2, shown: null }]), 0);

  const run = (shown: boolean) =>
    measureRun({
      changes: [
        { id: 1, checkable: true, shown: true },
        { id: 2, checkable: false, shown, notOneToOne: true },
      ],
      checks: { 1: { outcome: "shown" } },
      report,
      times: { claim: 0, finish: 1000, end: 1000, progress: [], edits: [] },
    });
  assert.deepEqual([run(false).falseChecks, run(false).oneToOneByPage, run(false).oneToOneByChecks], [[2], 1, 1]);
  assert.deepEqual([run(true).falseChecks, run(true).oneToOneByPage, run(true).oneToOneByChecks], [[], 1, 1]);
  assert.deepEqual(run(true).oneToOneCounts, { byChecks: { part: 1, whole: 1 }, byPage: { part: 1, whole: 1 } });
});

test("the 1:1 rates pool over runs as the Variable rate does: a run of one change and a run of three weigh as their changes, not as two runs", () => {
  const run = (shown: boolean[]) =>
    measureRun({
      changes: shown.map((s, i) => ({ id: i + 1, checkable: true, shown: s })),
      checks: Object.fromEntries(shown.map((s, i) => [i + 1, { outcome: s ? "shown" : "not shown" }])),
      report: { compliant: true, applied: [], notApplied: [], problems: [] },
      times: { claim: 0, finish: 1000, end: 1000, progress: [], edits: [] },
    });
  const runs = [run([false]), run([true, true, true])];
  assert.deepEqual(pooled(runs.map((r) => r.oneToOneCounts.byPage)), { rate: 0.75, part: 3, whole: 4 });
  assert.deepEqual(pooled(runs.map((r) => r.oneToOneCounts.byChecks)), { rate: 0.75, part: 3, whole: 4 });
  assert.equal(summarize(runs.map((r) => r.oneToOneByPage)).median, 0.5);
});

test("a scenario's own expectations are counted by the share that hold at the end; a scenario with none, or a run from before them, has no rate (ticket 86)", () => {
  assert.equal(scenarioExpectationsHold([{ atEnd: true }, { atEnd: false }]), 0.5);
  assert.equal(scenarioExpectationsHold([{ atEnd: true }]), 1);
  assert.equal(scenarioExpectationsHold([]), null);
  assert.equal(scenarioExpectationsHold(undefined), null);
});
