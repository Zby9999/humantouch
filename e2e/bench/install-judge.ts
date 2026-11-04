/**
 * What the install bench tells the Agent, and how it judges an install
 * (ticket 91): pure functions over what a run left behind (the transcript,
 * `git status` and `git diff`, what `doctor` and `remove` printed), so a run's
 * raw results can be judged again later, by a newer rule.
 */
import type { Transcript } from "./metrics.ts";

/** Step 1's command, as README has it. */
export const NPX_INIT = "npx -y 03kind@latest init";

/** The longest the toggle may take to show, from the Agent's start (docs/goals.md, Light). */
const TOGGLE_BUDGET_MS = 60_000;

/** What the designer copies to their Agent: the `text` block under README's "## For Agents", word for word. */
export function forAgents(readme: string): string {
  const section = /^## For Agents\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1] ?? "";
  const block = /^```text\n([\s\S]*?)\n```$/m.exec(section)?.[1];
  if (!block) throw new Error("README.md has no ```text block under ## For Agents");
  return block;
}

/**
 * The steps with step 1 installing the package packed from this repository,
 * at `tarball`, in place of 03kind@latest: the only change. As `file:`, for
 * npx runs a bare path as a program of its own.
 */
export function withLocalPackage(prompt: string, tarball: string): string {
  if (prompt.split(NPX_INIT).length !== 2) throw new Error(`The steps name \`${NPX_INIT}\` not once: step 1 cannot be pointed at the local package`);
  return prompt.replace(NPX_INIT, `npx -y file:${tarball} init`);
}

/** Tools by which an Agent asks the designer something and waits for the answer. */
const ASKING_TOOLS = /^(AskUserQuestion|ask_?user|ask_?followup_?question|request_?user_?input)$/i;

/** A sentence asking the designer to decide or answer before the Agent goes on. */
const ASKS = /\b(should I|shall I|do you want( me)? to|would you like( me)? to|how would you like|which (?:one|option|port|command) (?:do|would|should)|please (?:confirm|choose|decide)|let me know (?:whether|which|how|if (?:I should|you(?:'d| would)? (?:like|want) me to)))\b|要不要|是否需要|需要我|请确认|请选择|你希望/i;

/** The toggle, as an Agent names it: step 3's ask (look for it, tell me if it is not there) is about it. */
const ABOUT_THE_TOGGLE = /\b(button|toggle)\b|按钮|切换/i;

/** The sentences of `text`; an address is never split, its `?` and `.` being no sentence's end. */
function sentences(text: string): string[] {
  const urls: string[] = [];
  const kept = text.replace(/\bhttps?:\/\/[^\s<>"'`)\]]*[^\s<>"'`)\].,;:!?。，！？]/g, (url) => `\u0000${urls.push(url) - 1}\u0000`);
  return (kept.match(/[^.!?。！？\n]+[.!?。！？]*/g) ?? []).map((sentence) => sentence.trim().replace(/\u0000(\d+)\u0000/g, (_, i) => urls[Number(i)])).filter(Boolean);
}

/**
 * The sentence of `text` that asks the designer something, or null: a
 * question (ending in ? or ？), or a sentence asking them to decide; but not
 * one about the toggle, which is step 3's own ask (tell me if it is not there,
 * can you see it).
 */
export function waitsOnAnswer(text: string): string | null {
  return sentences(text).find((sentence) => (/[?？]$/.test(sentence) || ASKS.test(sentence)) && !ABOUT_THE_TOGGLE.test(sentence)) ?? null;
}

/** `doctor` as the Agent runs it: by npx, by the package manager, or by the project's copy. */
const DOCTOR = /\b03kind(?:\/dist\/cli\.js)?["']?\s+doctor\b/;

/** Whether the transcript shows `doctor` run and saying "All good.": the steps are done. */
function doctorAllGood(transcript: Pick<Transcript, "toolCalls">): boolean {
  return transcript.toolCalls.some((call) => DOCTOR.test(call.command ?? "") && /All good\./.test(call.output));
}

interface Intervention {
  /** Why the Agent needed the designer, or null: a tool that asks them, or a question it ended on before the steps were done. */
  asked: string | null;
  /**
   * A question it ended on after `doctor` said "All good." (an offer, as
   * "Would you like me to commit?"): no one is needed, but the designer is
   * shown it (代定, ticket 91 review).
   */
  trailingQuestion: string | null;
}

/** Whether the Agent needed the designer, from its transcript. */
export function intervention(transcript: Pick<Transcript, "toolCalls" | "finalText">): Intervention {
  const tool = transcript.toolCalls.find((call) => ASKING_TOOLS.test(call.name));
  const question = waitsOnAnswer(transcript.finalText);
  const done = doctorAllGood(transcript);
  return {
    asked: tool ? `called ${tool.name}` : question && !done ? `its last message waits on an answer before the steps were done: "${question}"` : null,
    trailingQuestion: question && done ? question : null,
  };
}

/** Whether the last message tells the designer to look for the round button at the page's bottom right (step 3, headless). */
export function toldToLook(text: string): boolean {
  return /bottom[\s-]*right|右下/i.test(text) && ABOUT_THE_TOGGLE.test(text) && /\b(page|round|03Kind)\b|页面|圆/i.test(text);
}

/** The steps, in order, as the transcript shows the Agent reached them. */
const STEPS = ["ran init", "started a dev server", "ran doctor", "doctor All good", "told to look"] as const;
export type Step = (typeof STEPS)[number];

/**
 * Which steps the transcript shows the Agent reached, for ticket 24's "where
 * it got stuck, and why": `init` run (by 03kind's name or a packed file), a
 * dev server started (a `dev` script, `vite`, `next dev`), `doctor` run, and
 * saying "All good.", and the designer told to look for the toggle.
 */
export function stepsReached(transcript: Pick<Transcript, "toolCalls" | "finalText">): Step[] {
  const ran = (pattern: RegExp) => transcript.toolCalls.some((call) => pattern.test(call.command ?? ""));
  const reached: Record<Step, boolean> = {
    "ran init": ran(/(?:03kind\S*|\.tgz)["']?\s+init\b/),
    "started a dev server": ran(/\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?dev|vite(?!\s+build)|next\s+dev)\b/),
    "ran doctor": ran(DOCTOR),
    "doctor All good": doctorAllGood(transcript),
    "told to look": toldToLook(transcript.finalText),
  };
  return STEPS.filter((step) => reached[step]);
}

/** 03Kind's own files, as `init` changes them: not the project's source. */
const THIRD_KIND_FILES = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.gitignore|AGENTS\.md|\.agents\/skills\/03kind\/.*|\.claude\/skills\/03kind\/.*)$/;

/**
 * What a dev server's output goes to when an Agent sends it to a file in the
 * project (pi may, ticket 91): no source, and not counted against `remove`
 * either, but listed as logs left (代定, ticket 91 review).
 */
const LOGS = /(^|\/)[^/]*\.log$/;

/** The two files of the project's source `init` changes, by framework: the build config, and the file that renders the app. */
const PLACES = {
  vite: [/^vite\.config\.[cm]?[jt]s$/, /^src\/(main|index)\.[jt]sx?$/],
  next: [/^next\.config\.[cm]?[jt]s$/, /^(src\/)?app\/layout\.[jt]sx?$/],
};
type Framework = keyof typeof PLACES;

/** The files of a `git status --porcelain` listing, with whether git tracks them; a rename by its new name. */
function statusFiles(status: string): { file: string; untracked: boolean }[] {
  return status
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => ({ file: line.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""), untracked: line.startsWith("??") }));
}

/** The log files a `git status --porcelain` listing has untracked. */
export function logsLeft(status: string): string[] {
  return statusFiles(status)
    .filter(({ file, untracked }) => untracked && LOGS.test(file))
    .map(({ file }) => file);
}

/** The lines added and taken out of each file of a diff, blank ones left out. */
function diffLines(diff: string): Map<string, { added: string[]; removed: string[] }> {
  const files = new Map<string, { added: string[]; removed: string[] }>();
  let current: { added: string[]; removed: string[] } | null = null;
  for (const line of diff.split("\n")) {
    const header = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (header) files.set(header[1], (current = { added: [], removed: [] }));
    else if (!current || /^(\+\+\+|---) /.test(line) || !line.slice(1).trim()) continue;
    else if (line.startsWith("+")) current.added.push(line.slice(1));
    else if (line.startsWith("-")) current.removed.push(line.slice(1));
  }
  return files;
}

/**
 * The places the project's source changed (docs/goals.md, Light: at most two,
 * the build config and the file that renders the app, each by an import plus
 * one line), from `git status --porcelain --untracked-files=all` and
 * `git diff HEAD`. 03Kind's own files are not counted, nor a log file; any
 * other file than those two is a place that fails, and so is a new file.
 */
export function sourceEdits(status: string, diff: string, framework: Framework): { places: string[]; problems: string[] } {
  const lines = diffLines(diff);
  const changed = statusFiles(status).filter(({ file }) => !THIRD_KIND_FILES.test(file) && !LOGS.test(file));
  const places = changed.map(({ file }) => file).sort();
  const problems: string[] = [];
  if (places.length > 2) problems.push(`${places.length} places changed: ${places.join(", ")}`);
  for (const { file, untracked } of changed) {
    if (!PLACES[framework].some((place) => place.test(file))) problems.push(`${file}: neither the build config nor the file that renders the app`);
    if (untracked) {
      problems.push(`${file}: a new file`);
      continue;
    }
    const { added, removed } = lines.get(file) ?? { added: [], removed: [] };
    const imports = added.filter((line) => /^\s*import\b/.test(line)).length;
    if (added.length > 2) problems.push(`${file}: ${added.length} lines added, not an import and one line`);
    else if (removed.length > 1) problems.push(`${file}: ${removed.length} lines taken out, not one line rewritten`);
    else if (added.length === 2 && imports !== 1) problems.push(`${file}: no import among the lines added`);
  }
  return { places, problems };
}

type Criterion = "toggle" | "ended" | "unattended" | "doctor" | "source" | "removed";

export interface Judged {
  criterion: Criterion;
  pass: boolean;
  why: string;
}

export interface InstallOutcome {
  framework: Framework;
  /** From the Agent's start to the toggle found on its dev server's page, or null when it never was. */
  toggleMs: number | null;
  /** How the Agent's session ended. */
  exitCode: number | null;
  timedOut: boolean;
  transcript: Pick<Transcript, "toolCalls" | "finalText">;
  /** What the bench's own `doctor` printed, once the Agent had ended. */
  doctor: string;
  /** `git status --porcelain --untracked-files=all` and `git diff HEAD` once the Agent had ended. */
  status: string;
  diff: string;
  /** The same two after `remove`. */
  afterRemove: { status: string; diff: string };
}

/** Every criterion an install must pass (ticket 91 and its review), each with why it passed or failed. */
export function judgeInstall(outcome: InstallOutcome): Judged[] {
  const { framework, toggleMs, exitCode, timedOut, transcript, doctor, status, diff, afterRemove } = outcome;
  const { asked } = intervention(transcript);
  const crossed = doctor.split("\n").filter((line) => line.startsWith("✗"));
  const source = sourceEdits(status, diff, framework);
  const logs = logsLeft(afterRemove.status);
  const left = statusFiles(afterRemove.status).filter(({ file }) => !logs.includes(file));
  // An untracked file's diff is shown as a new file's: a log's goes with it.
  const diffLeft = afterRemove.diff
    .split(/^(?=diff --git )/m)
    .filter((part) => !/^diff --git a\/\S* b\/(\S*)/.test(part) || !LOGS.test(/^diff --git a\/\S* b\/(\S*)/.exec(part)![1]))
    .join("");
  const leftWhy = [left.length && `git status: ${left.map(({ file }) => file).join(", ")}`, diffLeft.trim() && "git diff is not empty"].filter(Boolean);
  return [
    {
      criterion: "toggle",
      pass: toggleMs !== null && toggleMs <= TOGGLE_BUDGET_MS,
      why: toggleMs === null ? "the toggle was never found on a page of a dev server the Agent started" : `the toggle showed ${(toggleMs / 1000).toFixed(1)}s from the Agent's start (≤ ${TOGGLE_BUDGET_MS / 1000}s)`,
    },
    // Stuck is a failure (ticket 91, 背景).
    {
      criterion: "ended",
      pass: !timedOut && exitCode === 0,
      why: timedOut ? "the Agent was stopped at the bench's time limit" : exitCode === 0 ? "the Agent's session ended on its own" : `the Agent exited with code ${exitCode}`,
    },
    { criterion: "unattended", pass: !asked, why: asked ?? "no tool asked the designer, and the last message waits on no answer" },
    {
      criterion: "doctor",
      pass: !crossed.length && /^All good\.$/m.test(doctor),
      why: crossed.length ? crossed.join("; ") : /^All good\.$/m.test(doctor) ? "All good." : "doctor did not say All good.",
    },
    {
      criterion: "source",
      pass: !source.problems.length,
      why: source.problems.length ? source.problems.join("; ") : `${source.places.length} places: ${source.places.join(", ") || "none"}`,
    },
    { criterion: "removed", pass: !leftWhy.length, why: leftWhy.length ? `after remove, ${leftWhy.join("; ")}` : `git status and git diff empty after remove${logs.length ? `, but for logs left: ${logs.join(", ")}` : ""}` },
  ];
}
