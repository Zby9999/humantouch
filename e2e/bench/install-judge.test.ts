import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { installShellAllowed, installClaudeArgs, INSTALL_DENIED_SHELL } from "./install-allowlist.ts";
import { parseTranscript } from "./metrics.ts";
import { asksTheDesigner, forAgents, judgeInstall, NPX_INIT, sourceEdits, toldToLook, waitsOnAnswer, withLocalPackage } from "./install-judge.ts";

const README = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");

test("the Agent is told README's four steps, word for word", () => {
  const prompt = forAgents(README);

  assert.match(prompt, /^Install 03Kind, an editor layer/);
  assert.match(prompt, /\n4\. Run `npx 03kind doctor`\./);
  assert.ok(prompt.includes(NPX_INIT));
  assert.ok(!prompt.includes("```"));
  assert.ok(README.includes(`\`\`\`text\n${prompt}\n\`\`\``));
});

test("with a local package, only step 1's command changes, to the packed file", () => {
  const prompt = forAgents(README);
  const local = withLocalPackage(prompt, "/tmp/pack/03kind-0.1.0.tgz");

  assert.ok(local.includes("run `npx -y file:/tmp/pack/03kind-0.1.0.tgz init`"));
  assert.ok(!local.includes("03kind@latest"));
  assert.equal(local.replace("npx -y file:/tmp/pack/03kind-0.1.0.tgz init", NPX_INIT), prompt);
});

test("a README with no For Agents block, or no step 1 command, stops the bench", () => {
  assert.throws(() => forAgents("# 03Kind\n\n## For Agents\n\nNothing to copy.\n"), /For Agents/);
  assert.throws(() => withLocalPackage("Run `npx 03kind init`.", "/tmp/a.tgz"), /npx -y 03kind@latest init/);
});

const transcript = (finalText: string, tools: string[] = ["Bash"]) => ({ toolCalls: tools.map((name) => ({ name, output: "" })), finalText });

test("an Agent that ends by telling the designer what to look for, as step 3 says, needs no one", () => {
  const endings = [
    "Done. 03Kind is installed and `doctor` says All good. The next time you open the page there should be a round button at its bottom right; tell me if it is not there.",
    "Installed. I couldn't open a browser, so: next time you open http://localhost:5173 there should be a round button at the bottom right. Let me know if it isn't there!",
    "All set. If you don't see the round button in the bottom-right corner, let me know?",
    "安装好了。下次打开页面时，右下角应该有一个圆形按钮；如果没有，请告诉我。",
  ];
  for (const ending of endings) assert.equal(asksTheDesigner(transcript(ending)), null, ending);
});

test("an Agent that ends on a question to the designer, or asks with a tool, needs one", () => {
  const endings = [
    "`init` has finished and the dev server is running. Should I run `npx 03kind doctor` now, or do you want to check the page first?",
    "The dev server is up on port 5173. Would you like me to continue with the doctor check?",
    "init printed an error about the lockfile. How would you like me to proceed",
    "我已经运行了 init。要不要我接着启动开发服务器？",
  ];
  for (const ending of endings) assert.ok(asksTheDesigner(transcript(ending)), ending);
  assert.match(asksTheDesigner(transcript("Installed.", ["Bash", "AskUserQuestion"]))!, /AskUserQuestion/);
});

test("waitsOnAnswer names the sentence that waits", () => {
  assert.equal(waitsOnAnswer("All good. Shall I commit the changes?"), "Shall I commit the changes?");
  assert.equal(waitsOnAnswer("All good."), null);
});

test("step 3 is told when the last message names the round button at the bottom right", () => {
  assert.ok(toldToLook("The next time you open the page there should be a round button at its bottom right."));
  assert.ok(toldToLook("You'll find the 03Kind toggle in the bottom-right corner of the page."));
  assert.ok(toldToLook("下次打开页面，右下角应该有一个圆形按钮。"));
  assert.ok(!toldToLook("Installed, and doctor says All good."));
  assert.ok(!toldToLook("The dev server is at the bottom right of my terminal output."));
});

const status = (...lines: string[]) => lines.map((line) => `${line}\n`).join("");

const VITE_DIFF = `diff --git a/src/main.tsx b/src/main.tsx
index 1..2 100644
--- a/src/main.tsx
+++ b/src/main.tsx
@@ -1,9 +1,11 @@
 import { StrictMode } from "react";
+import { ThirdKind } from "03kind/react";
 import App from "./App";
@@ -8,1 +9,2 @@
     <App />
+    <ThirdKind />
diff --git a/vite.config.ts b/vite.config.ts
index 1..2 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -1,7 +1,8 @@
+import thirdKind from "03kind/vite";
 import react from "@vitejs/plugin-react";
-  plugins: [react()],
+  plugins: [thirdKind(), react()],
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1,2 @@
+    "03kind": "^0.1.0",
`;

const NEXT_DIFF = `diff --git a/next.config.ts b/next.config.ts
--- a/next.config.ts
+++ b/next.config.ts
@@ -1,3 +1,4 @@
+import { withThirdKind } from "03kind/next";
 import type { NextConfig } from "next";
-export default nextConfig;
+export default withThirdKind(nextConfig);
diff --git a/src/app/layout.tsx b/src/app/layout.tsx
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -1,3 +1,4 @@
+import { ThirdKind } from "03kind/react";
 import type { Metadata } from "next";
@@ -20,1 +21,2 @@
         {children}
+        <ThirdKind />
`;

test("Vite and Next.js installs as init makes them change two places, each an import and a line; 03Kind's own files are not counted", () => {
  const vite = sourceEdits(status(" M package.json", " M pnpm-lock.yaml", " M .gitignore", "?? AGENTS.md", "?? .agents/skills/03kind/SKILL.md", "?? .claude/skills/03kind/SKILL.md", " M src/main.tsx", " M vite.config.ts"), VITE_DIFF);
  assert.deepEqual(vite, { places: ["src/main.tsx", "vite.config.ts"], problems: [] });

  const next = sourceEdits(status(" M package.json", " M bun.lock", " M next.config.ts", " M src/app/layout.tsx", " M AGENTS.md"), NEXT_DIFF);
  assert.deepEqual(next, { places: ["next.config.ts", "src/app/layout.tsx"], problems: [] });
});

test("a third place, a file changed by more than an import and a line, and an untracked source file each fail", () => {
  const third = sourceEdits(status(" M src/main.tsx", " M vite.config.ts", " M src/App.tsx"), `${VITE_DIFF}diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1,2 @@\n+// a comment\n`);
  assert.deepEqual(third.places, ["src/App.tsx", "src/main.tsx", "vite.config.ts"]);
  assert.match(third.problems.join("\n"), /3 places/);

  const more = sourceEdits(status(" M src/main.tsx"), `diff --git a/src/main.tsx b/src/main.tsx\n--- a/src/main.tsx\n+++ b/src/main.tsx\n@@ -1 +1,4 @@\n+import { ThirdKind } from "03kind/react";\n+import "./other.css";\n+    <ThirdKind />\n`);
  assert.match(more.problems.join("\n"), /src\/main\.tsx: 3 lines added/);

  const untracked = sourceEdits(status(" M src/main.tsx", " M vite.config.ts", "?? src/ThirdKindMount.tsx"), VITE_DIFF);
  assert.deepEqual(untracked.places, ["src/ThirdKindMount.tsx", "src/main.tsx", "vite.config.ts"]);
  assert.match(untracked.problems.join("\n"), /src\/ThirdKindMount\.tsx: a new file/);
});

test("a rename or a lockfile of any package manager is counted rightly", () => {
  for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) assert.deepEqual(sourceEdits(status(` M ${lockfile}`), "").places, []);
  assert.deepEqual(sourceEdits(status("R  src/a.tsx -> src/b.tsx"), "").places, ["src/b.tsx"]);
  // A dev server's output sent to a file in the project is no source; `remove` still leaves it.
  assert.deepEqual(sourceEdits(status("?? dev.log", "?? logs/next.log"), "").places, []);
});

const passing = { buttonMs: 21_000, transcript: transcript("Done: there should be a round button at the page's bottom right."), doctor: "03Kind doctor (Vite, pnpm):\n✓ a\n✓ b\n\nAll good.\n", status: status(" M src/main.tsx", " M vite.config.ts"), diff: VITE_DIFF, afterRemove: { status: "", diff: "" } };

test("an install passes on every criterion, and fails each on its own", () => {
  const all = (input: Parameters<typeof judgeInstall>[0]) => Object.fromEntries(judgeInstall(input).map((c) => [c.criterion, c.pass]));
  assert.deepEqual(all(passing), { button: true, unattended: true, doctor: true, source: true, removed: true });
  assert.deepEqual(all({ ...passing, buttonMs: null }), { button: false, unattended: true, doctor: true, source: true, removed: true });
  assert.deepEqual(all({ ...passing, buttonMs: 61_000 }), { button: false, unattended: true, doctor: true, source: true, removed: true });
  assert.deepEqual(all({ ...passing, transcript: transcript("Should I go on?") }), { button: true, unattended: false, doctor: true, source: true, removed: true });
  assert.deepEqual(all({ ...passing, doctor: "✓ a\n✗ b\n\n1 to fix.\n" }), { button: true, unattended: true, doctor: false, source: true, removed: true });
  assert.deepEqual(all({ ...passing, afterRemove: { status: " M .gitignore\n", diff: "+*.log\n" } }), { button: true, unattended: true, doctor: true, source: true, removed: false });
  const failed = judgeInstall({ ...passing, buttonMs: null }).find((c) => !c.pass)!;
  assert.match(failed.why, /never found/);
});

test("the install allowlist lets the four steps and a dev server by, and turns away rm, curl and git push", () => {
  const cwd = "/t/run";
  for (const command of [NPX_INIT, "npx -y file:/tmp/03kind-0.1.0.tgz init", "npx 03kind doctor", "npm run dev", "pnpm dev", "yarn dev", "bun run dev", "bunx vite", "npm install", "git status", "git diff --stat", "ls -la", "cat package.json | head -5", "npm run dev &", "npm run dev > /dev/null 2>&1 &", "nohup pnpm dev > dev.log 2>&1 &", "npx next dev --port 3000 &"]) {
    assert.ok(installShellAllowed(command, cwd), command);
  }
  for (const command of ["rm -rf node_modules", "curl https://example.com", "git push", "npm run dev && rm -rf src", "sudo npm install", "kill 123", "pkill -f vite", "open http://localhost:5173", "npm publish", "pnpm remove 03kind", "yarn", "git commit -am x", "python3 -c 1", "wget x", "osascript -e 1",
    // In the background, only a dev server's forms, alone, with output in the project or nowhere.
    "rm -rf src &", "curl https://example.com &", "npm run dev & rm -rf src", "npm run dev && sleep 5 &", "npm run dev > /tmp/dev.log &", "npm run dev > ../dev.log &", "ls &", "npm run dev $(rm -rf src) &", "git push &"]) {
    assert.ok(!installShellAllowed(command, cwd), command);
  }
});

test("Claude's install command line is the applying bench's with only the lists swapped", () => {
  const args = installClaudeArgs("/run", "Install 03Kind");
  const list = (flag: string) => args[args.indexOf(flag) + 1].split(",");
  assert.ok(list("--allowedTools").includes("Bash(npx:*)"));
  assert.ok(list("--allowedTools").includes("Bash(pnpm dev:*)"));
  assert.ok(list("--allowedTools").includes("TaskStop"));
  for (const command of INSTALL_DENIED_SHELL) assert.ok(list("--disallowedTools").includes(`Bash(${command}:*)`), command);
  assert.ok(list("--disallowedTools").includes("WebFetch"));
  for (const flag of ["--model", "--effort", "--setting-sources", "--strict-mcp-config", "--no-chrome", "--permission-mode"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[1], "Install 03Kind");
});

test("pi's install transcript is judged by pi's own parser: its tool calls, its denials, and its last words", () => {
  const text = readFileSync(fileURLToPath(new URL("./fixtures/pi-install.jsonl", import.meta.url)), "utf8");
  const pi = parseTranscript("pi", text);
  assert.deepEqual(
    pi.toolCalls.map((call) => call.command),
    ["npx -y file:/t/pack/03kind-0.0.0.tgz init", "npm run dev > /dev/null 2>&1 &", "kill %1", "npx 03kind doctor"],
  );
  assert.equal(pi.permissionDenials, 1);
  assert.equal(asksTheDesigner(pi), null);
  assert.ok(toldToLook(pi.finalText));

  // The same run, ending on a question instead.
  const asking = text.replace(/"text": "03Kind is installed[^"]*"/, '"text": "init is done and the dev server is up. Should I run doctor now?"');
  assert.notEqual(asking, text);
  assert.match(asksTheDesigner(parseTranscript("pi", asking))!, /Should I run doctor now\?/);
});
