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
export const BUTTON_BUDGET_MS = 60_000;

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

/**
 * Step 3's own ask: tell me if the button is not there. It waits on nothing:
 * the Agent is done, and the designer answers only when it is missing.
 */
const STEP_3_ASK = /\b(?:not there|isn't there|is not there|not see|don't see|do not see|can't see|cannot see|missing|doesn't (?:show|appear)|does not (?:show|appear))\b|没有|看不到|不在/i;

/**
 * The sentence of `text` that waits on an answer from the designer, or null:
 * a question (ending in ? or ？), or a sentence asking them to decide, but not
 * step 3's "tell me if it is not there".
 */
export function waitsOnAnswer(text: string): string | null {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]*/g) ?? [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    const question = /[?？]$/.test(sentence) || ASKS.test(sentence);
    if (question && !STEP_3_ASK.test(sentence)) return sentence;
  }
  return null;
}

/**
 * Why the Agent needed someone, from its transcript, or null when it did not:
 * it called a tool that asks the designer, or its last message waits on an
 * answer from them.
 */
export function asksTheDesigner(transcript: Pick<Transcript, "toolCalls" | "finalText">): string | null {
  const asked = transcript.toolCalls.find((call) => ASKING_TOOLS.test(call.name));
  if (asked) return `called ${asked.name}`;
  const waiting = waitsOnAnswer(transcript.finalText);
  return waiting ? `its last message waits on an answer: "${waiting}"` : null;
}

/** Whether the last message tells the designer to look for the round button at the page's bottom right (step 3, headless). */
export function toldToLook(text: string): boolean {
  return (/bottom[\s-]*right|右下/i.test(text) && /\b(button|toggle)\b|按钮|切换/i.test(text) && /\b(page|round|03Kind)\b|页面|圆/i.test(text)) && !/terminal|终端/i.test(text);
}

/** 03Kind's own files, as `init` changes them: not the user's source. */
const THIRD_KIND_FILES = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.gitignore|AGENTS\.md|\.agents\/skills\/03kind\/.*|\.claude\/skills\/03kind\/.*)$/;

/** The files of a `git status --porcelain` listing, with whether git tracks them; a rename by its new name. */
function statusFiles(status: string): { file: string; untracked: boolean }[] {
  return status
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => ({ file: line.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""), untracked: line.startsWith("??") }));
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
 * The places the user's source changed (docs/goals.md, Light: at most two,
 * the build config and the file that renders the app, each by an import plus
 * one line), from `git status --porcelain --untracked-files=all` and
 * `git diff HEAD`. 03Kind's own files are not counted; a new file is a place,
 * and more than an import and one line.
 */
export function sourceEdits(status: string, diff: string): { places: string[]; problems: string[] } {
  const lines = diffLines(diff);
  const changed = statusFiles(status).filter(({ file }) => !THIRD_KIND_FILES.test(file));
  const places = changed.map(({ file }) => file).sort();
  const problems: string[] = [];
  if (places.length > 2) problems.push(`${places.length} places changed: ${places.join(", ")}`);
  for (const { file, untracked } of changed) {
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

export type Criterion = "button" | "unattended" | "doctor" | "source" | "removed";

export interface Judged {
  criterion: Criterion;
  pass: boolean;
  why: string;
}

export interface InstallOutcome {
  /** From the Agent's start to the toggle found on its dev server's page, or null when it never was. */
  buttonMs: number | null;
  transcript: Pick<Transcript, "toolCalls" | "finalText">;
  /** What the bench's own `doctor` printed, once the Agent had ended. */
  doctor: string;
  /** `git status --porcelain --untracked-files=all` and `git diff HEAD` once the Agent had ended. */
  status: string;
  diff: string;
  /** The same two after `remove`. */
  afterRemove: { status: string; diff: string };
}

/** Every criterion an install must pass (ticket 91), each with why it passed or failed. */
export function judgeInstall(outcome: InstallOutcome): Judged[] {
  const { buttonMs, transcript, doctor, status, diff, afterRemove } = outcome;
  const asked = asksTheDesigner(transcript);
  const crossed = doctor.split("\n").filter((line) => line.startsWith("✗"));
  const source = sourceEdits(status, diff);
  const left = [afterRemove.status.trim() && `git status:\n${afterRemove.status.trimEnd()}`, afterRemove.diff.trim() && "git diff is not empty"].filter(Boolean);
  return [
    {
      criterion: "button",
      pass: buttonMs !== null && buttonMs <= BUTTON_BUDGET_MS,
      why: buttonMs === null ? "the toggle was never found on a page of a dev server the Agent started" : `the toggle showed ${(buttonMs / 1000).toFixed(1)}s from the Agent's start (≤ ${BUTTON_BUDGET_MS / 1000}s)`,
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
    { criterion: "removed", pass: !left.length, why: left.length ? `after remove, ${left.join("; ")}` : "git status and git diff empty after remove" },
  ];
}
