/**
 * An Agent played by a script, for walking the install bench through before
 * the package is published and before any real Agent runs on it (ticket 91).
 * It is given the same steps and environment as a real one, and does them the
 * plain way: runs step 1's command as the steps name it, starts the dev server
 * with the command `init` printed (detached, left running, on its default
 * port), runs `npx 03kind doctor` until it says "All good.", and ends telling
 * the designer to look for the round button at the bottom right. It prints its
 * transcript in Claude Code's stream-json form, so the bench judges it as it
 * judges Claude.
 *
 *   node e2e/bench/scripted-agent.ts <the steps> [--plant <error>]
 *
 * `--plant` makes it go wrong in one way, each meant to fail one criterion:
 * `no-dev-server` skips step 2; `extra-edit` also edits a third source file
 * (which `remove` leaves behind too); `asks` stops after step 2 with a
 * question to the designer; `leaves-file` adds a line to `.gitignore` that
 * `remove` cannot take out.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PLANTS = ["no-dev-server", "extra-edit", "asks", "leaves-file"] as const;
export type Plant = (typeof PLANTS)[number];

/** The files of a project that render a page, other than the one `init` mounts in: where `extra-edit` writes. */
const OTHER_SOURCE = ["src/App.tsx", "src/App.jsx", "app/page.tsx", "app/page.jsx", "app/page.js", "src/app/page.tsx", "src/app/page.jsx", "src/app/page.js"];

/** Step 1's command, as the steps name it. */
export function stepOneCommand(steps: string): string {
  const command = /^1\.[^\n]*?`([^`]+)`/m.exec(steps)?.[1];
  if (!command) throw new Error("Step 1 names no command");
  return command;
}

/** The dev server command `init` printed, if it printed one. */
export function devCommand(initOutput: string): string | null {
  return /Start the dev server \(`([^`]+)`\)/.exec(initOutput)?.[1] ?? null;
}

let calls = 0;
const say = (event: object) => process.stdout.write(`${JSON.stringify(event)}\n`);

/** A tool call and its result, as Claude Code's transcript has them. */
function toolCall(name: string, input: object, result: string) {
  const id = `toolu_scripted_${++calls}`;
  say({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } });
  say({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result }] } });
}

/** Runs a shell command in the project, as the Agent's Bash would; what it printed and its exit code. */
function run(command: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function bash(command: string): Promise<{ code: number; output: string }> {
  const result = await run(command);
  toolCall("Bash", { command, description: command }, `${result.output}${result.code ? `\nExit code ${result.code}` : ""}`);
  return result;
}

/** Adds `line` at the end of `file` in the project, told as an Edit. */
function appendLine(file: string, line: string) {
  const path = join(process.cwd(), file);
  const before = readFileSync(path, "utf8");
  const last = before.split("\n").filter(Boolean).at(-1) ?? "";
  appendFileSync(path, `${before.endsWith("\n") ? "" : "\n"}${line}\n`);
  toolCall("Edit", { file_path: path, old_string: last, new_string: `${last}\n${line}` }, `The file ${path} has been updated.`);
}

function end(text: string) {
  say({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
  say({ type: "result", subtype: "success", is_error: false, result: text, permission_denials: [] });
}

async function main([steps, ...rest]: string[]) {
  const plantAt = rest.indexOf("--plant");
  const plant = plantAt < 0 ? null : (rest[plantAt + 1] as Plant);
  if (plant && !PLANTS.includes(plant)) throw new Error(`No plant ${plant}: ${PLANTS.join(", ")}`);
  say({ type: "system", subtype: "init", model: "scripted", cwd: process.cwd(), tools: ["Bash", "Edit"], plant });

  // 1. init.
  const init = await bash(stepOneCommand(steps));
  if (init.code !== 0 && !/Finish by hand/.test(init.output)) {
    return end(`Step 1 failed, and I cannot go on: \`${stepOneCommand(steps)}\` exited with code ${init.code}. Its last lines:\n\n${init.output.trim().split("\n").slice(-5).join("\n")}`);
  }
  if (plant === "extra-edit") {
    const file = OTHER_SOURCE.find((candidate) => existsSync(join(process.cwd(), candidate)));
    if (!file) throw new Error("No source file to edit besides the mount");
    appendLine(file, "// Checked by the scripted Agent.");
  }

  // 2. The dev server, detached and left running, as `nohup … &` would.
  if (plant !== "no-dev-server") {
    const command = devCommand(init.output) ?? "npm run dev";
    spawn("/bin/sh", ["-c", command], { cwd: process.cwd(), env: process.env, stdio: "ignore", detached: true }).unref();
    toolCall("Bash", { command, description: "Start the dev server", run_in_background: true }, `Command running in background with ID: scripted-dev.`);
  }
  if (plant === "asks") {
    return end("`init` has finished and the dev server is running. Should I run `npx 03kind doctor` now, or would you rather look at the page first?");
  }

  // 3 is the branch with no browser: told at the end. 4. doctor, until All good.
  for (let tries = 0; tries < 3; tries++) if (/All good\./.test((await bash("npx 03kind doctor")).output)) break;
  if (plant === "leaves-file") appendLine(".gitignore", "*.local.log");

  end(
    "03Kind is installed, and `npx 03kind doctor` says All good. I cannot open a browser here, so: the next time you open the page there should be a round button at its bottom right; tell me if it is not there.",
  );
}

if (import.meta.main) await main(process.argv.slice(2));
