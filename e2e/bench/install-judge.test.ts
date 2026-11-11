import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { forAgents, intervention, judgeInstall, logsLeft, NPX_INIT, sourceEdits, stepsReached, toldToLook, waitsOnAnswer, withLocalPackage, type InstallOutcome } from "./install-judge.ts";
import { parseTranscript, type ToolCall } from "./metrics.ts";

const README = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");

test("the Agent is told README's four steps, word for word", () => {
  const prompt = forAgents(README);

  assert.match(prompt, /^Install Human Touch, an editor layer/);
  assert.match(prompt, /\n4\. Run `npx humantouch doctor`\./);
  assert.ok(prompt.includes(NPX_INIT));
  assert.ok(!prompt.includes("```"));
  assert.ok(README.includes(`\`\`\`text\n${prompt}\n\`\`\``));
});

test("with a local package, only step 1's command changes, to the packed file", () => {
  const prompt = forAgents(README);
  const local = withLocalPackage(prompt, "/tmp/pack/humantouch-0.1.0.tgz");

  assert.ok(local.includes("run `npx -y file:/tmp/pack/humantouch-0.1.0.tgz init`"));
  assert.ok(!local.includes("humantouch@latest"));
  assert.equal(local.replace("npx -y file:/tmp/pack/humantouch-0.1.0.tgz init", NPX_INIT), prompt);
});

test("a README with no For Agents block, or no step 1 command, stops the bench", () => {
  assert.throws(() => forAgents("# Human Touch\n\n## For Agents\n\nNothing to copy.\n"), /For Agents/);
  assert.throws(() => withLocalPackage("Run `npx humantouch init`.", "/tmp/a.tgz"), /npx -y humantouch@latest init/);
});


const INIT: ToolCall = { name: "Bash", command: "npx -y humantouch@latest init", output: "Installed. Start the dev server (`npm run dev`)…" };
const DEV: ToolCall = { name: "Bash", command: "npm run dev", output: "" };
const DOCTOR_GOOD: ToolCall = { name: "Bash", command: "npx humantouch doctor", output: "✓ a\n\nAll good.\n" };
const DOCTOR_BAD: ToolCall = { name: "Bash", command: "npx humantouch doctor", output: "✗ a\n\n1 to fix.\n" };
/** A transcript: the calls the Agent made, and its last words. */
const transcript = (finalText: string, toolCalls: ToolCall[] = [INIT, DEV, DOCTOR_GOOD]) => ({ toolCalls, finalText });

test("an Agent that ends by telling the designer about the toggle, as step 3 says, needs no one, even asking about it", () => {
  const endings = [
    "Done. Human Touch is installed and `doctor` says All good. The next time you open the page there should be a round button at its bottom right; tell me if it is not there.",
    "Installed. I couldn't open a browser, so: next time you open http://localhost:5173/?x=1. there should be a round button at the bottom right. Let me know if it isn't there!",
    "All set. If you don't see the round button in the bottom-right corner, let me know?",
    "Can you see the round Human Touch button at the bottom right?",
    "安装好了。下次打开页面时，右下角应该有一个圆形按钮，能看到吗？",
  ];
  for (const ending of endings) {
    assert.equal(intervention(transcript(ending)).asked, null, ending);
    assert.equal(intervention(transcript(ending, [INIT, DEV])).asked, null, ending);
  }
});

test("an Agent that ends on a question before the steps are done, or asks with a tool, needs the designer", () => {
  const endings = [
    "`init` has finished and the dev server is running. Should I run `npx humantouch doctor` now, or do you want to check the page first?",
    "The dev server is up on port 5173. Would you like me to continue with the doctor check?",
    "init printed an error about the lockfile. How would you like me to proceed",
    "Should I install the missing peer dependency?",
    "我已经运行了 init。要不要我接着启动开发服务器？",
    // About the toggle, but asking the designer to decide: not step 3's ask.
    "Should I use 5174 for the toggle page?",
    "Want me to also add a button to the header?",
    "Which port should the toggle's page be on?",
    "要不要我把按钮放到左下角？",
  ];
  for (const ending of endings) {
    assert.ok(intervention(transcript(ending, [INIT, DEV])).asked, ending);
    assert.ok(intervention(transcript(ending, [INIT, DEV, DOCTOR_BAD])).asked, ending);
  }
  assert.match(intervention(transcript("Installed.", [INIT, { name: "AskUserQuestion", output: "" }, DOCTOR_GOOD])).asked!, /AskUserQuestion/);
});

test("a question after doctor said All good is an offer: no one is needed, and it is recorded for the designer", () => {
  for (const ending of ["All good, and the toggle should be at the bottom right of the page. Would you like me to commit?", "装好了。需要我帮你提交吗？", "Installed. Anything else?"]) {
    const { asked, trailingQuestion } = intervention(transcript(ending));
    assert.equal(asked, null, ending);
    assert.ok(trailingQuestion, ending);
  }
  assert.equal(intervention(transcript("Installed, and doctor says All good.")).trailingQuestion, null);
});

test("waitsOnAnswer names the sentence that waits, and never splits an address", () => {
  assert.equal(waitsOnAnswer("All good. Shall I commit the changes?"), "Shall I commit the changes?");
  assert.equal(waitsOnAnswer("All good."), null);
  assert.equal(waitsOnAnswer("It is at http://localhost:5173/?x=1. Open it."), null);
  assert.equal(waitsOnAnswer("Open http://localhost:5173/?tab=a. Shall I go on?"), "Shall I go on?");
});

test("step 3 is told when the last message names the round button at the bottom right, a terminal mentioned or not", () => {
  assert.ok(toldToLook("The next time you open the page there should be a round button at its bottom right."));
  assert.ok(toldToLook("You'll find the Human Touch toggle in the bottom-right corner of the page."));
  assert.ok(toldToLook("There should be a round button in the lower right of the page."));
  assert.ok(toldToLook("Look for the Human Touch toggle in the lower-right corner."));
  assert.ok(toldToLook("下次打开页面，右下角应该有一个圆形按钮。"));
  assert.ok(toldToLook("The dev server runs in a terminal; open the page and look for the round button at its bottom right."));
  assert.ok(toldToLook("开发服务器在终端里跑着；打开页面，右下角会有一个圆形按钮。"));
  assert.ok(!toldToLook("Installed, and doctor says All good."));
  assert.ok(!toldToLook("The dev server's log is at the bottom right of my terminal."));
});

test("the steps reached are read from the transcript, for where an Agent got stuck", () => {
  assert.deepEqual(stepsReached(transcript("Installed; the round button should be at the page's bottom right.")), ["ran init", "started a dev server", "ran doctor", "doctor All good", "told to look"]);
  assert.deepEqual(stepsReached(transcript("Stopped.", [INIT])), ["ran init"]);
  // doctor as --package local's step 1 has npx run it: by the packed file.
  const localDoctor: ToolCall = { name: "Bash", command: "npx -y file:/t/pack/humantouch-0.0.0.tgz doctor", output: "All good.\n" };
  assert.deepEqual(stepsReached(transcript("", [localDoctor])), ["ran doctor", "doctor All good"]);
  assert.equal(intervention(transcript("Shall I commit?", [INIT, DEV, localDoctor])).asked, null);
  assert.deepEqual(stepsReached(transcript("", [{ name: "Bash", command: "npx -y file:/t/humantouch-0.0.0.tgz init", output: "" }, { name: "Bash", command: "pnpm dev > dev.log 2>&1 &", output: "" }, DOCTOR_BAD])), ["ran init", "started a dev server", "ran doctor"]);
  assert.deepEqual(stepsReached(transcript("", [{ name: "Bash", command: "npx vite build", output: "" }])), []);
});

const status = (...lines: string[]) => lines.map((line) => `${line}\n`).join("");

const VITE_DIFF = `diff --git a/src/main.tsx b/src/main.tsx
index 1..2 100644
--- a/src/main.tsx
+++ b/src/main.tsx
@@ -1,9 +1,11 @@
 import { StrictMode } from "react";
+import { HumanTouch } from "humantouch/react";
 import App from "./App";
@@ -8,1 +9,2 @@
     <App />
+    <HumanTouch />
diff --git a/vite.config.ts b/vite.config.ts
index 1..2 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -1,7 +1,8 @@
+import humanTouch from "humantouch/vite";
 import react from "@vitejs/plugin-react";
-  plugins: [react()],
+  plugins: [humanTouch(), react()],
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1,2 @@
+    "humantouch": "^0.1.0",
`;

const NEXT_DIFF = `diff --git a/next.config.ts b/next.config.ts
--- a/next.config.ts
+++ b/next.config.ts
@@ -1,3 +1,4 @@
+import { withHumanTouch } from "humantouch/next";
 import type { NextConfig } from "next";
-export default nextConfig;
+export default withHumanTouch(nextConfig);
diff --git a/src/app/layout.tsx b/src/app/layout.tsx
--- a/src/app/layout.tsx
+++ b/src/app/layout.tsx
@@ -1,3 +1,4 @@
+import { HumanTouch } from "humantouch/react";
 import type { Metadata } from "next";
@@ -20,1 +21,2 @@
         {children}
+        <HumanTouch />
`;


test("Vite and Next.js installs as init makes them change two places, each an import and a line; Human Touch's own files are not counted", () => {
  const vite = sourceEdits(status(" M package.json", " M pnpm-lock.yaml", " M .gitignore", "?? AGENTS.md", "?? .agents/skills/humantouch/SKILL.md", "?? .claude/skills/humantouch/SKILL.md", " M src/main.tsx", " M vite.config.ts"), VITE_DIFF, "vite");
  assert.deepEqual(vite, { places: ["src/main.tsx", "vite.config.ts"], problems: [] });

  const next = sourceEdits(status(" M package.json", " M bun.lock", " M next.config.ts", " M src/app/layout.tsx", " M AGENTS.md"), NEXT_DIFF, "next");
  assert.deepEqual(next, { places: ["next.config.ts", "src/app/layout.tsx"], problems: [] });
});

test("a third place, another file than the config and the render file, a file changed by more than an import and a line, and an untracked source file each fail", () => {
  const third = sourceEdits(status(" M src/main.tsx", " M vite.config.ts", " M src/App.tsx"), `${VITE_DIFF}diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1,2 @@\n+// a comment\n`, "vite");
  assert.deepEqual(third.places, ["src/App.tsx", "src/main.tsx", "vite.config.ts"]);
  assert.match(third.problems.join("\n"), /3 places/);

  // Two places, but one of them the wrong file.
  const wrong = sourceEdits(status(" M src/App.tsx", " M vite.config.ts"), `diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1,2 @@\n+import { HumanTouch } from "humantouch/react";\n+      <HumanTouch />\n`, "vite");
  assert.deepEqual(wrong.problems, ["src/App.tsx: neither the build config nor the file that renders the app"]);
  assert.match(sourceEdits(status(" M app/page.tsx"), "", "next").problems.join(), /app\/page\.tsx: neither/);
  assert.match(sourceEdits(status(" M src/main.tsx"), "", "next").problems.join(), /src\/main\.tsx: neither/);

  const more = sourceEdits(status(" M src/main.tsx"), `diff --git a/src/main.tsx b/src/main.tsx\n--- a/src/main.tsx\n+++ b/src/main.tsx\n@@ -1 +1,4 @@\n+import { HumanTouch } from "humantouch/react";\n+import "./other.css";\n+    <HumanTouch />\n`, "vite");
  assert.match(more.problems.join("\n"), /src\/main\.tsx: 3 lines added/);

  const untracked = sourceEdits(status(" M src/main.tsx", " M vite.config.ts", "?? src/HumanTouchMount.tsx"), VITE_DIFF, "vite");
  assert.deepEqual(untracked.places, ["src/HumanTouchMount.tsx", "src/main.tsx", "vite.config.ts"]);
  assert.match(untracked.problems.join("\n"), /src\/HumanTouchMount\.tsx: a new file/);
});

test("a rename, a lockfile of any package manager, and a log file are counted rightly", () => {
  for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) assert.deepEqual(sourceEdits(status(` M ${lockfile}`), "", "vite").places, []);
  assert.deepEqual(sourceEdits(status("R  src/a.tsx -> src/main.tsx"), "", "vite").places, ["src/main.tsx"]);
  // A dev server's output sent to a file in the project is no source.
  assert.deepEqual(sourceEdits(status("?? dev.log", "?? logs/next.log"), "", "vite").places, []);
  assert.deepEqual(logsLeft(status("?? dev.log", " M package.json", "?? notes.txt")), ["dev.log"]);
});

const passing: InstallOutcome = {
  framework: "vite",
  toggleMs: 21_000,
  exitCode: 0,
  timedOut: false,
  transcript: transcript("Done: there should be a round button at the page's bottom right."),
  doctor: "Human Touch doctor (Vite, pnpm):\n✓ a\n✓ b\n\nAll good.\n",
  status: status(" M src/main.tsx", " M vite.config.ts"),
  diff: VITE_DIFF,
  afterRemove: { status: "", diff: "" },
};
const verdicts = (outcome: InstallOutcome) => Object.fromEntries(judgeInstall(outcome).map((c) => [c.criterion, c.pass]));
const ALL_PASS = { toggle: true, ended: true, unattended: true, doctor: true, source: true, removed: true };
const allBut = (failed: keyof typeof ALL_PASS) => ({ ...ALL_PASS, [failed]: false });

test("an install passes on every criterion, and fails each on its own", () => {
  assert.deepEqual(verdicts(passing), ALL_PASS);
  assert.deepEqual(verdicts({ ...passing, toggleMs: null }), allBut("toggle"));
  assert.deepEqual(verdicts({ ...passing, toggleMs: 61_000 }), allBut("toggle"));
  assert.deepEqual(verdicts({ ...passing, timedOut: true, exitCode: null }), allBut("ended"));
  assert.deepEqual(verdicts({ ...passing, exitCode: 1 }), allBut("ended"));
  assert.deepEqual(verdicts({ ...passing, transcript: transcript("Should I go on?", [INIT, DEV]) }), allBut("unattended"));
  assert.deepEqual(verdicts({ ...passing, doctor: "✓ a\n✗ b\n\n1 to fix.\n" }), allBut("doctor"));
  assert.deepEqual(verdicts({ ...passing, status: status(" M src/App.tsx", " M vite.config.ts") }), allBut("source"));
  assert.deepEqual(verdicts({ ...passing, afterRemove: { status: " M .gitignore\n", diff: "diff --git a/.gitignore b/.gitignore\n+*.log\n" } }), allBut("removed"));
  assert.match(judgeInstall({ ...passing, toggleMs: null }).find((c) => !c.pass)!.why, /never found/);
  assert.match(judgeInstall({ ...passing, timedOut: true }).find((c) => !c.pass)!.why, /time limit/);
  // A run recorded before the criterion: not judged on it.
  const before = judgeInstall({ ...passing, exitCode: undefined, timedOut: undefined }).find((c) => c.criterion === "ended")!;
  assert.equal(before.pass, true);
  assert.match(before.why, /not judged/);
});

test("after remove, an untracked file left fails removed, but a log file is only listed", () => {
  const notes = { status: "?? notes.txt\n", diff: "diff --git a/notes.txt b/notes.txt\nnew file mode 100644\n+x\n" };
  assert.deepEqual(verdicts({ ...passing, afterRemove: notes }), allBut("removed"));
  const log = { status: "?? dev.log\n", diff: "diff --git a/dev.log b/dev.log\nnew file mode 100644\n+VITE ready\n" };
  assert.deepEqual(verdicts({ ...passing, afterRemove: log }), ALL_PASS);
  assert.match(judgeInstall({ ...passing, afterRemove: log }).at(-1)!.why, /logs left: dev\.log/);
});

test("pi's install transcript is judged by pi's own parser: its tool calls, its denials, and its last words", () => {
  const text = readFileSync(fileURLToPath(new URL("./fixtures/pi-install.jsonl", import.meta.url)), "utf8");
  const pi = parseTranscript("pi", text);
  assert.deepEqual(
    pi.toolCalls.map((call) => call.command),
    ["npx -y file:/t/pack/humantouch-0.0.0.tgz init", "npm run dev > /dev/null 2>&1 &", "kill %1", "npx humantouch doctor"],
  );
  assert.equal(pi.permissionDenials, 1);
  assert.deepEqual(intervention(pi), { asked: null, trailingQuestion: null });
  assert.deepEqual(stepsReached(pi), ["ran init", "started a dev server", "ran doctor", "doctor All good", "told to look"]);

  // The same run, doctor not yet good, ending on a question instead.
  const asking = text.replace("All good.\\n", "1 to fix.\\n").replace(/"text": "Human Touch is installed[^"]*"/, '"text": "init is done and the dev server is up. Should I run doctor again?"');
  assert.notEqual(asking, text);
  assert.match(intervention(parseTranscript("pi", asking)).asked!, /Should I run doctor again\?/);
});
