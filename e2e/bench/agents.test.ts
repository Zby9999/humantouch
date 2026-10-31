import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { AGENTS, commandLine, headedBrowsers, headlessShell, NO_SKILL_PROMPT, PROMPT } from "./agents.ts";
import { withoutSkill } from "./project.ts";

const scratch = mkdtempSync(join(tmpdir(), "vernierkit-bench-agents-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A file that stands in for a browser binary. */
function fakeBinary(path: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
  return path;
}

/**
 * The browser plugins Cursor's run is given, with VK_BENCH_HEADLESS_SHELL set
 * to `shell`: each `--plugin-dir` of its command line, by the plugin's name,
 * with the MCP servers it declares.
 */
function cursorPlugins(shell: string): Record<string, unknown> {
  const dir = mkdtempSync(join(scratch, "project-"));
  const folder = mkdtempSync(join(scratch, "run-"));
  const saved = process.env.VK_BENCH_HEADLESS_SHELL;
  process.env.VK_BENCH_HEADLESS_SHELL = shell;
  try {
    AGENTS.cursor.prepare!(dir, folder);
  } finally {
    if (saved === undefined) delete process.env.VK_BENCH_HEADLESS_SHELL;
    else process.env.VK_BENCH_HEADLESS_SHELL = saved;
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
  for (const agent of ["claude", "cursor"] as const) {
    const args = AGENTS[agent].args("/run", NO_SKILL_PROMPT);
    assert.equal(args[args.indexOf("-p") + 1], "运行 `npx vernierkit claim`，照输出落地");
    assert.equal(AGENTS[agent].args("/run")[1], PROMPT);
    assert.notEqual(commandLine(agent, NO_SKILL_PROMPT), commandLine(agent));
  }
});

test("a project with no Skill: init's Skill and its line in AGENTS.md are taken out, and nothing else (ticket 65)", () => {
  const dir = mkdtempSync(join(scratch, "project-"));
  for (const folder of [".agents/skills/vernierkit", ".claude/skills/vernierkit", ".claude/skills/deploy"]) {
    mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, folder, "SKILL.md"), "# Skill");
  }
  const line = "Vernier Kit: to apply the designer's design changes, or undo the last round, follow `.agents/skills/vernierkit/SKILL.md`.";
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
  const line = "Vernier Kit: to apply the designer's design changes, or undo the last round, follow `.agents/skills/vernierkit/SKILL.md`.";
  writeFileSync(join(dir, "AGENTS.md"), `${line}\n`);
  mkdirSync(join(dir, ".vernier"));
  const config = { file: "vite.config.ts", before: "plugins: [", after: "plugins: [vernier(), " };
  const record = { dependency: true, edits: [config, { file: "AGENTS.md", before: "", after: `${line}\n` }, { file: ".gitignore", before: "", after: ".vernier/\n" }], created: ["AGENTS.md"] };
  writeFileSync(join(dir, ".vernier/install.json"), JSON.stringify(record));

  withoutSkill(dir);

  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".vernier/install.json"), "utf8")), {
    dependency: true,
    edits: [config, { file: ".gitignore", before: "", after: ".vernier/\n" }],
    created: [],
  });
});
