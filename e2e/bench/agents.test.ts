import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { AGENTS, commandLine, headedBrowsers, headlessShell, NO_SKILL_PROMPT, piConfigFingerprints, piFffVersion, PROMPT, runAgent } from "./agents.ts";
import { withoutSkill } from "./project.ts";

const scratch = mkdtempSync(join(tmpdir(), "03kind-bench-agents-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A file that stands in for a browser binary. */
function fakeBinary(path: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
  return path;
}

/**
 * The browser plugins Cursor's run is given, with TK_BENCH_HEADLESS_SHELL set
 * to `shell`: each `--plugin-dir` of its command line, by the plugin's name,
 * with the MCP servers it declares.
 */
function cursorPlugins(shell: string): Record<string, unknown> {
  const dir = mkdtempSync(join(scratch, "project-"));
  const folder = mkdtempSync(join(scratch, "run-"));
  const saved = process.env.TK_BENCH_HEADLESS_SHELL;
  process.env.TK_BENCH_HEADLESS_SHELL = shell;
  try {
    AGENTS.cursor.prepare!(dir, folder);
  } finally {
    if (saved === undefined) delete process.env.TK_BENCH_HEADLESS_SHELL;
    else process.env.TK_BENCH_HEADLESS_SHELL = saved;
  }
  const args = AGENTS.cursor.args(folder);
  const plugins = args.flatMap((arg, i) => (arg === "--plugin-dir" ? [args[i + 1]] : []));
  return Object.fromEntries(
    plugins.map((plugin) => {
      const manifest = JSON.parse(readFileSync(join(plugin, ".cursor-plugin/plugin.json"), "utf8"));
      return [manifest.name, JSON.parse(readFileSync(join(plugin, manifest.mcpServers), "utf8")).mcpServers];
    }),
  );
}

test("Cursor's run gets the designer's two browser plugins by their own names, their servers headless and isolated, on Playwright's headless shell", () => {
  const shell = fakeBinary(join(scratch, "shell/chrome-headless-shell"));

  assert.deepEqual(cursorPlugins(shell), {
    playwright: { playwright: { command: "npx", args: ["-y", "@playwright/mcp@0.0.83", "--headless", "--isolated", "--executable-path", shell] } },
    "chrome-devtools-mcp": { "chrome-devtools": { command: "npx", args: ["-y", "chrome-devtools-mcp@1.11.0", "--headless", "--isolated", "--executablePath", shell] } },
  });
});

test("with no headless shell to be found, the two servers are still headless and isolated, with no browser path", () => {
  assert.deepEqual(cursorPlugins(join(scratch, "nowhere/chrome-headless-shell")), {
    playwright: { playwright: { command: "npx", args: ["-y", "@playwright/mcp@0.0.83", "--headless", "--isolated"] } },
    "chrome-devtools-mcp": { "chrome-devtools": { command: "npx", args: ["-y", "chrome-devtools-mcp@1.11.0", "--headless", "--isolated"] } },
  });
});

test("Cursor's project is left as before: only its permissions are written there", () => {
  const dir = mkdtempSync(join(scratch, "project-"));
  AGENTS.cursor.prepare!(dir, mkdtempSync(join(scratch, "run-")));

  assert.deepEqual(readdirSync(join(dir, ".cursor")), ["cli.json"]);
});

test("the headless shell is found beside the Chromium Playwright launches, at the same revision", () => {
  const browsers = join(scratch, "ms-playwright");
  const chromium = fakeBinary(join(browsers, "chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"));
  fakeBinary(join(browsers, "chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell"));
  const shell = fakeBinary(join(browsers, "chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell"));

  assert.equal(headlessShell({}, chromium), shell);
  assert.equal(headlessShell({}, join(scratch, "elsewhere/chrome")), null);
});

test("of the processes under the Agent, the browsers that came up with a window are told apart from headless ones and from everything else", () => {
  const ps = [
    { pid: 10, ppid: 1, command: "cursor-agent -p 落地我的设计改动" },
    { pid: 11, ppid: 10, command: "npm exec @playwright/mcp@latest --headless" },
    { pid: 12, ppid: 11, command: "/cache/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-gpu --remote-debugging-pipe" },
    { pid: 13, ppid: 12, command: "/cache/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --type=renderer" },
    { pid: 14, ppid: 10, command: "npm exec chrome-devtools-mcp@1.11.0" },
    { pid: 15, ppid: 14, command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --user-data-dir=/tmp/p" },
    { pid: 16, ppid: 14, command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe --user-data-dir=/tmp/q" },
    { pid: 17, ppid: 16, command: "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU) --type=gpu-process" },
    { pid: 18, ppid: 10, command: "/x/Chromium.app/Contents/MacOS/Chromium --no-first-run" },
    { pid: 20, ppid: 1, command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
  ];

  assert.deepEqual(headedBrowsers(ps, 10), [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe --user-data-dir=/tmp/q",
    "/x/Chromium.app/Contents/MacOS/Chromium --no-first-run",
  ]);
});

test("with no Skill, each Agent is asked only to run claim and apply as it says, by a command line of its own (ticket 65)", () => {
  for (const agent of ["claude", "cursor", "pi"] as const) {
    const args = AGENTS[agent].args("/run", NO_SKILL_PROMPT);
    assert.equal(args[args.indexOf("-p") + 1], "运行 `npx humantouch claim`，照输出落地");
    assert.equal(AGENTS[agent].args("/run")[1], PROMPT);
    assert.notEqual(commandLine(agent, NO_SKILL_PROMPT), commandLine(agent));
  }
});

test("pi runs on Command Code's DeepSeek v4.1 flash at thinking high, pinned, unless TK_BENCH_PI names another binary; with the project's Skill only, and none of the designer's extensions but pi-fff, nor MCP, prompt templates or themes", () => {
  const saved = process.env.TK_BENCH_PI;
  try {
    process.env.TK_BENCH_PI = "/opt/pi";
    const line = commandLine("pi");
    assert.match(line, /^\/opt\/pi -p '落地我的设计改动' --mode json --provider command-code --model deepseek\/deepseek-v4\.1-flash --thinking high --no-session --offline /);
    assert.match(line, / --no-extensions -e '?\S+\/pi-commandcode-provider'? -e '?\S+\/@ff-labs\/pi-fff'? --fff-mode override --fff-frecency-db '<run folder>\/fff\/frecency' --fff-history-db '<run folder>\/fff\/history' --fff-follow-symlinks -e '<run folder>\/pi-extension\/pi-extension\.ts' --no-mcp --no-skills --skill \.agents\/skills\/humantouch --no-prompt-templates --no-themes --approve /);
    // grep and find are fff's, in place of pi's own (ticket 92).
    assert.match(line, / --tools read,bash,edit,write,ls,grep,find$/);
    assert.equal(AGENTS.pi.model, "command-code/deepseek/deepseek-v4.1-flash");
  } finally {
    if (saved === undefined) delete process.env.TK_BENCH_PI;
    else process.env.TK_BENCH_PI = saved;
  }
});

test("pi's run gets the bench's extension, and the rule it holds shell commands to, in its own folder, where its command line loads it from; the project is left as before", () => {
  const dir = mkdtempSync(join(scratch, "project-"));
  const folder = mkdtempSync(join(scratch, "run-"));

  AGENTS.pi.prepare!(dir, folder);

  const args = AGENTS.pi.args(folder);
  const extensions = args.flatMap((arg, i) => (arg === "-e" ? [args[i + 1]] : []));
  assert.equal(extensions.at(-1), join(folder, "pi-extension/pi-extension.ts"));
  assert.deepEqual(readdirSync(join(folder, "pi-extension")).sort(), ["allowlist.ts", "pi-extension.ts"]);
  assert.deepEqual(readdirSync(dir), []);
});

test("pi runs with pi-fff, the designer's installed copy, its databases in the run's own folder and not the designer's; the record has its version (ticket 92)", () => {
  const folder = mkdtempSync(join(scratch, "run-"));
  const args = AGENTS.pi.args(folder);
  const value = (flag: string) => args[args.indexOf(flag) + 1];

  const extensions = args.flatMap((arg, i) => (arg === "-e" ? [args[i + 1]] : []));
  assert.equal(extensions.length, 3);
  assert.match(extensions[1], /\/\.pi\/agent\/npm\/node_modules\/@ff-labs\/pi-fff$/);
  assert.equal(value("--fff-frecency-db"), join(folder, "fff/frecency"));
  assert.equal(value("--fff-history-db"), join(folder, "fff/history"));
  assert.ok(!args.some((arg) => /\.pi\/agent\/fff/.test(arg)));
  // fff's grep and find under the names of pi's own, as the designer's pi has them; no multi_grep.
  assert.equal(value("--fff-mode"), "override");
  assert.deepEqual(value("--tools").split(",").sort(), ["bash", "edit", "find", "grep", "ls", "read", "write"]);

  const installed = mkdtempSync(join(scratch, "pi-fff-"));
  writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "@ff-labs/pi-fff", version: "0.11.0" }));
  assert.equal(piFffVersion(installed), "0.11.0");
  assert.equal(piFffVersion(join(scratch, "nowhere")), null);
  assert.deepEqual(Object.keys(AGENTS.pi.extensions!()), ["pi-fff"]);
});

test("pi's runs record a fingerprint of the designer's settings.json and models.json, which still apply to them: a digest of each file's bytes, not the file, null for one absent (ticket 88)", () => {
  const agentDir = mkdtempSync(join(scratch, "pi-agent-"));
  writeFileSync(join(agentDir, "settings.json"), "abc");
  // sha256 of the three bytes "abc" (FIPS 180-2's example).
  assert.deepEqual(piConfigFingerprints(agentDir), { "settings.json": "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "models.json": null });
  assert.deepEqual(piConfigFingerprints(join(scratch, "nowhere")), { "settings.json": null, "models.json": null });
  // The real one reads the designer's ~/.pi/agent: here only that pi has it.
  assert.equal(typeof AGENTS.pi.configFingerprints, "function");
  for (const agent of ["claude", "cursor"] as const) assert.equal(AGENTS[agent].configFingerprints, undefined);
});

test("Claude's and Cursor's command lines have nothing of fff, and their runs record no extension", () => {
  for (const agent of ["claude", "cursor"] as const) {
    assert.doesNotMatch(commandLine(agent), /fff/);
    assert.equal(AGENTS[agent].extensions, undefined);
  }
});

test("Claude runs on Sonnet 5.5 at effort medium, pinned (ticket 88, the designer's decision of 2026-11-05), and its record says so", () => {
  assert.match(commandLine("claude"), / --model claude-sonnet-5-5 --effort medium /);
  assert.equal(AGENTS.claude.model, "claude-sonnet-5-5");
  assert.equal(AGENTS.claude.effort, "medium (--effort medium)");
});

test("the effort pi ran at is the thinking level its answers name in the transcript; Claude Code says it in its debug log only when it lowers it, Cursor nowhere", () => {
  const folder = mkdtempSync(join(scratch, "run-"));
  writeFileSync(join(folder, "transcript.jsonl"), `${JSON.stringify({ type: "message_end", message: { role: "assistant", thinkingLevel: "high" } })}\n`);

  assert.equal(AGENTS.pi.effortSeen!(folder), "high");
  assert.equal(AGENTS.claude.effortSeen!(folder), null);
  writeFileSync(join(folder, "claude-debug.log"), "[DEBUG] effort: medium\n");
  assert.equal(AGENTS.claude.effortSeen!(folder), "medium");
  // Lowered: the level it used, not the one asked for.
  writeFileSync(join(folder, "claude-debug.log"), "[DEBUG] [effort] Effort 'high' exceeds the cap for claude-sonnet-5-5; using 'medium'.\n");
  assert.equal(AGENTS.claude.effortSeen!(folder), "medium");
  writeFileSync(join(folder, "claude-debug.log"), "[DEBUG] [effort] the API refused effort 'high' for this model: no more than 'low'\n");
  assert.equal(AGENTS.claude.effortSeen!(folder), "low");
  assert.equal(AGENTS.cursor.effortSeen, undefined);
});

test("Cursor runs on grok-4.7-high unless TK_BENCH_CURSOR_MODEL names another id, and its command line says which (ticket 63)", () => {
  const saved = process.env.TK_BENCH_CURSOR_MODEL;
  try {
    delete process.env.TK_BENCH_CURSOR_MODEL;
    assert.match(commandLine("cursor"), / --model grok-4\.7-high /);
    process.env.TK_BENCH_CURSOR_MODEL = "grok-4.7[context=256k,reasoning_effort=high,fast=false]";
    assert.match(commandLine("cursor"), / --model 'grok-4\.7\[context=256k,reasoning_effort=high,fast=false\]' /);
    assert.doesNotMatch(commandLine("cursor"), /grok-4\.7-high/);
  } finally {
    if (saved === undefined) delete process.env.TK_BENCH_CURSOR_MODEL;
    else process.env.TK_BENCH_CURSOR_MODEL = saved;
  }
});

test("a project with no Skill: init's Skill and its line in AGENTS.md are taken out, and nothing else (ticket 65)", () => {
  const dir = mkdtempSync(join(scratch, "project-"));
  for (const folder of [".agents/skills/humantouch", ".claude/skills/humantouch", ".claude/skills/deploy"]) {
    mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, folder, "SKILL.md"), "# Skill");
  }
  const line = "Human Touch: to apply the designer's design changes, or undo the last round, follow `.agents/skills/humantouch/SKILL.md`.";
  writeFileSync(join(dir, "AGENTS.md"), `# Project\n\nUse pnpm.\n${line}\n`);

  withoutSkill(dir);

  assert.deepEqual(readdirSync(dir).sort(), [".claude", "AGENTS.md"]);
  assert.deepEqual(readdirSync(join(dir, ".claude/skills")), ["deploy"]);
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "# Project\n\nUse pnpm.\n");

  const alone = mkdtempSync(join(scratch, "project-"));
  writeFileSync(join(alone, "AGENTS.md"), `${line}\n`);
  withoutSkill(alone);
  assert.deepEqual(readdirSync(alone), []);
});

test("a project with no Skill: init's record of its line in AGENTS.md is taken out too, its other edits kept (ticket 63)", () => {
  const dir = mkdtempSync(join(scratch, "project-"));
  const line = "Human Touch: to apply the designer's design changes, or undo the last round, follow `.agents/skills/humantouch/SKILL.md`.";
  writeFileSync(join(dir, "AGENTS.md"), `${line}\n`);
  mkdirSync(join(dir, ".humantouch"));
  const config = { file: "vite.config.ts", before: "plugins: [", after: "plugins: [humanTouch(), " };
  const record = { dependency: true, edits: [config, { file: "AGENTS.md", before: "", after: `${line}\n` }, { file: ".gitignore", before: "", after: ".humantouch/\n" }], created: ["AGENTS.md"] };
  writeFileSync(join(dir, ".humantouch/install.json"), JSON.stringify(record));

  withoutSkill(dir);

  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".humantouch/install.json"), "utf8")), {
    dependency: true,
    edits: [config, { file: ".gitignore", before: "", after: ".humantouch/\n" }],
    created: [],
  });
});

test("Claude may run the Skill's undo and its viewing command for the run's own project only, as `last` prints them (its real path) and as the bench names it, quoted or not; the command line shows the project as a placeholder", () => {
  const project = mkdtempSync(join(scratch, "project-"));
  const real = realpathSync(project);
  const args = AGENTS.claude.args("/run", PROMPT, project);
  const rules = args[args.indexOf("--allowedTools") + 1].split(",");
  for (const dir of [real, project]) {
    for (const git of [`git -C "${dir}"`, `git -C ${dir}`]) {
      assert.ok(rules.includes(`Bash(${git} diff:*)`), git);
      assert.ok(rules.includes(`Bash(${git} apply)`), git);
    }
  }
  assert.ok(!rules.includes("Bash(git apply)"), "no bare git apply");
  assert.ok(!rules.some((rule) => /^Bash\(git (-C \S+ )?apply:/.test(rule)), "no prefix rule for git apply");
  // Two rules, quoted and not, for each of diff and apply, by each name of the project (one, where tmpdir() is a real path already).
  assert.equal(rules.filter((rule) => rule.includes(" -C ")).length, 8 / (real === project ? 2 : 1));
  assert.ok(!rules.some((rule) => rule.includes(" -C ") && !rule.includes(real) && !rule.includes(project)));

  const line = commandLine("claude");
  assert.match(line, /Bash\(git -C "<project>" diff:\*\),Bash\(git -C <project> diff:\*\),Bash\(git -C "<project>" apply\),Bash\(git -C <project> apply\)' --disallowedTools/);
  assert.doesNotMatch(line, /Bash\(git apply\)/);
  assert.doesNotMatch(line, new RegExp(project));
});

test("Claude has no rule for echo (ticket 101): Claude Code runs it as a read-only command already, and a rule would not govern where a redirect writes", () => {
  const args = AGENTS.claude.args("/run", PROMPT, "/project");
  const rules = args[args.indexOf("--allowedTools") + 1].split(",");
  assert.ok(!rules.some((rule) => /^Bash\(echo\b/.test(rule)), "no echo rule");
  assert.ok(rules.includes("Bash(cat:*)"));
});

test("an Agent that leaves a process running with its output ends when it exits, not when its output closes (the install bench)", async () => {
  const folder = mkdtempSync(join(scratch, "left-running-"));
  // The Agent prints its last words, starts a process that keeps its stdout, and exits.
  const agent = `console.log('{"type":"result","result":"done"}'); require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "inherit" }); setTimeout(() => process.exit(0), 100);`;
  let group = 0;
  const began = Date.now();
  try {
    const run = await runAgent("claude", folder, folder, 20_000, "", { spec: { binary: () => process.execPath, args: () => ["-e", agent] }, leaveRunning: true, onStart: (pid) => void (group = pid) });
    assert.equal(run.exitCode, 0);
    assert.equal(run.timedOut, false);
    assert.ok(Date.now() - began < 10_000, `took ${Date.now() - began} ms`);
    assert.match(readFileSync(join(folder, "transcript.jsonl"), "utf8"), /"result":"done"/);
  } finally {
    // What this test started: the Agent's own process group.
    try {
      if (group) process.kill(-group, "SIGKILL");
    } catch {
      // Gone already.
    }
  }
});
