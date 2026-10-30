/**
 * What a run of the applying bench is measured by, from what the Agent left
 * behind: its transcript (stream-json, one event a line), the round as
 * archived, and when the page and the command line moved. Pure functions, so
 * a run's raw results can be measured again later, by a newer rule.
 */

/** The Agents the bench runs. */
export type AgentName = "claude" | "cursor";

/** One tool call the Agent made, and what it got back. */
export interface ToolCall {
  name: string;
  /** For a shell command. */
  command?: string;
  /** For a tool on one path: a file read, written or searched. */
  path?: string;
  /** For a Skill the Agent loads by name (Claude Code's Skill tool). */
  skill?: string;
  /** What the tool gave the Agent to read. */
  output: string;
}

export interface Transcript {
  /** The model the Agent ran on, as the Agent says at the start. */
  model: string | null;
  toolCalls: ToolCall[];
  /** The Agent's last words: where the report is. */
  finalText: string;
  /** Tool calls the bench's permissions turned away. */
  permissionDenials: number;
}

type Event = Record<string, any>;

/** The events of a transcript; a line that is no JSON (a stray warning) is left out. */
function events(text: string): Event[] {
  return text.split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
}

export function parseTranscript(agent: AgentName, text: string): Transcript {
  return agent === "claude" ? parseClaudeCode(events(text)) : parseCursor(events(text));
}

function parseClaudeCode(all: Event[]): Transcript {
  const transcript: Transcript = { model: null, toolCalls: [], finalText: "", permissionDenials: 0 };
  const byId = new Map<string, ToolCall>();
  for (const event of all) {
    if (event.type === "system" && event.subtype === "init") transcript.model = event.model ?? null;
    if (event.type === "result") {
      transcript.finalText = event.result ?? "";
      transcript.permissionDenials = event.permission_denials?.length ?? 0;
    }
    for (const part of event.message?.content ?? []) {
      if (event.type === "assistant" && part.type === "tool_use") {
        const call: ToolCall = { name: part.name, ...where(part.input ?? {}), output: "" };
        byId.set(part.id, call);
        transcript.toolCalls.push(call);
      }
      if (event.type === "user" && part.type === "tool_result") {
        const call = byId.get(part.tool_use_id);
        if (call) call.output = textOf(part.content);
      }
      // A Skill's text comes in as a message of its own, right after the Skill tool's answer.
      const last = transcript.toolCalls.at(-1);
      if (event.type === "user" && part.type === "text" && last?.skill !== undefined) last.output += part.text;
    }
  }
  return transcript;
}

/**
 * Cursor tells each tool call twice, as it starts and as it completes; only
 * the second has the result. Its `result` event has every message of the run
 * run together, so the last words are its last assistant message.
 */
function parseCursor(all: Event[]): Transcript {
  const transcript: Transcript = { model: null, toolCalls: [], finalText: "", permissionDenials: 0 };
  for (const event of all) {
    if (event.type === "system" && event.subtype === "init") transcript.model = event.model ?? null;
    if (event.type === "assistant") {
      const text = textOf(event.message?.content);
      if (text.trim()) transcript.finalText = text;
    }
    if (event.type !== "tool_call" || event.subtype !== "completed") continue;
    const [key, call] = Object.entries(event.tool_call ?? {})[0] ?? [];
    if (!key) continue;
    const { args = {}, result = {} } = call as Event;
    const name = key.replace(/ToolCall$/, "");
    if (result.rejected || result.permissionDenied) transcript.permissionDenials++;
    const success = result.success;
    const output = success ? [success.stdout, success.stderr, success.content].filter((part) => typeof part === "string").join("") || JSON.stringify(success) : JSON.stringify(result);
    transcript.toolCalls.push({ name, ...where(args), output });
  }
  return transcript;
}

/** A tool's input, as far as the bench looks at it: the command it runs, or the path it works on. */
function where(input: Event): Pick<ToolCall, "command" | "path" | "skill"> {
  if (typeof input.command === "string") return { command: input.command };
  if (typeof input.skill === "string") return { skill: input.skill };
  const path = input.file_path ?? input.path;
  return typeof path === "string" ? { path } : {};
}

/** A tool result's text: a string, or text parts. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  return "";
}

/** What the tool calls of a run come to. */
export interface ToolCallStats {
  toolCalls: number;
  /** Searches over the project, or a folder of it, rather than in one file (see `isRepoWideSearch`). */
  repoWideSearches: number;
  /** How many times the Agent ran `claim`, and `done` (one run may report several changes). */
  claims: number;
  dones: number;
  /** Whether it ran `finish`. */
  finished: boolean;
  /**
   * Characters the Agent read: of the Skill (loaded, or read as a file), of
   * `claim`'s output, and of every tool's output, those two included.
   */
  charsRead: { skill: number; claim: number; total: number };
}

/** The command line's commands in a shell command, each time it runs one: `npx vernierkit done 2 && npx vernierkit finish` runs two. */
function vernierkitCommands(command: string): string[] {
  return [...command.matchAll(/vernierkit(?:\.js)?\s+(claim|done|finish|last)\b/g)].map((match) => match[1]);
}

const SEARCH_TOOLS = /^(grep|glob|search|codebase_?search|semantic_?search|file_?search|ripgrep|find)$/i;
const SHELL_SEARCH = /(^|[\s;&|(])(rg|ag|ack|fd|find|git\s+grep)\s|(^|[\s;&|(])grep\s+(-\w*[rR]\w*|--recursive)\b/;

/**
 * A search over the project or a folder of it: a search tool not given one
 * file, or a shell command that searches folders (`rg`, `find`, `git grep`,
 * `grep -r`). Goal: none (docs/goals.md, Light): the change notes say where
 * each change goes.
 */
export function isRepoWideSearch(call: ToolCall): boolean {
  if (call.command !== undefined) return SHELL_SEARCH.test(call.command);
  if (!SEARCH_TOOLS.test(call.name)) return false;
  return call.path === undefined || !/\.[a-z0-9]+$/i.test(call.path);
}

const SKILL_FILE = /skills\/vernierkit\/SKILL\.md$/;

export function toolCallStats(calls: ToolCall[]): ToolCallStats {
  const commands = calls.flatMap((call) => (call.command ? vernierkitCommands(call.command) : []));
  const sum = (some: ToolCall[]) => some.reduce((total, call) => total + call.output.length, 0);
  return {
    toolCalls: calls.length,
    repoWideSearches: calls.filter(isRepoWideSearch).length,
    claims: commands.filter((command) => command === "claim").length,
    dones: commands.filter((command) => command === "done").length,
    finished: commands.includes("finish"),
    charsRead: {
      skill: sum(calls.filter((call) => call.skill === "vernierkit" || (call.path !== undefined && SKILL_FILE.test(call.path)))),
      claim: sum(calls.filter((call) => call.command !== undefined && vernierkitCommands(call.command).includes("claim"))),
      total: sum(calls),
    },
  };
}

/** The report at the end of the Agent's reply, read against the Skill's form. */
export interface ReportCheck {
  /** Every change listed once, and each under ⚠️ with why and what was done instead. */
  compliant: boolean;
  /** The changes listed under ✓, and under ⚠️. */
  applied: number[];
  notApplied: number[];
  problems: string[];
}

const ITEM = /^\s*[-*]\s*(\d+)[.)]/;

/**
 * Reads the last ✓ section of `text`, and the ⚠️ section after it. The
 * headings may be in the designer's language: the form is the marks, the
 * numbered lines, and under ⚠️ two indented lines for why and instead.
 */
export function checkReport(text: string, ids: number[]): ReportCheck {
  const lines = text.split("\n");
  const start = lines.findLastIndex((line) => /^\W*✓/.test(line.trim()) && !ITEM.test(line));
  if (start < 0) return { compliant: false, applied: [], notApplied: [], problems: ["no ✓ section"] };
  const listed: { id: number; warned: boolean; notes: number }[] = [];
  let warned = false;
  for (const line of lines.slice(start + 1)) {
    if (/⚠/.test(line) && !ITEM.test(line)) warned = true;
    const item = ITEM.exec(line);
    if (item) listed.push({ id: Number(item[1]), warned, notes: 0 });
    else if (/^\s+\S.*[:：]/.test(line) && listed.at(-1)?.warned) listed.at(-1)!.notes++;
  }
  const problems: string[] = [];
  const once = (id: number) => listed.filter((item) => item.id === id).length;
  for (const id of new Set(listed.map((item) => item.id))) if (once(id) > 1) problems.push(`change ${id} listed more than once`);
  for (const item of listed) if (item.warned && item.notes < 2) problems.push(`change ${item.id} under ⚠️ without both why and instead`);
  for (const id of ids) if (!once(id)) problems.push(`change ${id} not listed`);
  const unique = (warnedOnes: boolean) => [...new Set(listed.filter((item) => item.warned === warnedOnes).map((item) => item.id))];
  return { compliant: !problems.length, applied: unique(false), notApplied: unique(true), problems };
}

/** A change of the scenario, as the run left it. */
export interface ChangeOutcome {
  id: number;
  /** Whether the editor layer's page check can tell this kind of change (the Skill's list: not a new layer, a brief, …). */
  checkable: boolean;
  /** Whether the page shows it at the end, by the scenario's own expectation; null when the scenario has none (a brief). */
  shown: boolean | null;
}

export interface RunInput {
  changes: ChangeOutcome[];
  /** The page's last check of each change, by id, as the round was archived. */
  checks: Record<string, { outcome: string }>;
  report: ReportCheck;
  /**
   * In ms: the claim, the finish (null when the Agent never ran it), the
   * Agent's end, and each bit of progress: a `done`, or a change newly shown
   * on the page.
   */
  times: { claim: number; finish: number | null; end: number; progress: number[] };
}

export interface RunMeasures {
  /** From `claim` to `finish`, or to the Agent's end without one; and that per change. */
  applyMs: number;
  applyMsPerChange: number;
  /** Changes the page can check that got a check (shown or not) before the round ended. */
  checked: number;
  /** 1:1 applied, by the page's checks (goals: the `done` check, not the Agent's word), of the changes the page can check; null with none. */
  oneToOneByChecks: number | null;
  /** 1:1 applied, by what the page shows at the end, of the changes the scenario has an expectation for; null with none. */
  oneToOneByPage: number | null;
  /** Changes the report lists as applied that the page does not show (by the expectation; else by the last check). */
  falseChecks: number[];
  /** The longest wait from the claim to a bit of progress, between two, or from the last to the end. */
  maxProgressGapMs: number;
}

export function measureRun({ changes, checks, report, times }: RunInput): RunMeasures {
  const end = times.finish ?? times.end;
  const applyMs = end - times.claim;
  const checkable = changes.filter((change) => change.checkable);
  const outcome = (id: number) => checks[id]?.outcome;
  const expected = changes.filter((change) => change.shown !== null);
  const rate = (part: number, whole: number) => (whole ? part / whole : null);
  const notShown = (id: number) => {
    const change = changes.find((c) => c.id === id);
    return change?.shown === null || change === undefined ? outcome(id) === "not shown" : !change.shown;
  };
  const events = [times.claim, ...[...times.progress].sort((a, b) => a - b).filter((t) => t >= times.claim && t <= end), end];
  return {
    applyMs,
    applyMsPerChange: applyMs / changes.length,
    checked: checkable.filter((change) => ["shown", "not shown"].includes(outcome(change.id) ?? "")).length,
    oneToOneByChecks: rate(checkable.filter((change) => outcome(change.id) === "shown").length, checkable.length),
    oneToOneByPage: rate(expected.filter((change) => change.shown).length, expected.length),
    falseChecks: report.applied.filter(notShown),
    maxProgressGapMs: Math.max(...events.slice(1).map((t, i) => t - events[i])),
  };
}

/** The median of the runs' values, and their range; runs with no value are left out. */
export function summarize(values: (number | null)[]): { median: number | null; min: number | null; max: number | null; n: number } {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return { median: null, min: null, max: null, n: 0 };
  const middle = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { median, min: sorted[0], max: sorted.at(-1)!, n: sorted.length };
}

/** The lines a diff adds, without the `+`. */
export function addedLines(diff: string): string {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

/** Whether `added` writes one of `tokens` (a Variable's class or CSS variable) as a whole word: `md:text-5xl!` writes `text-5xl`; `text-5xl` does not write `text-5`. */
export function usesVariable(added: string, tokens: string[]): boolean {
  return tokens.some((token) => new RegExp(`(^|[^\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w-])`, "m").test(added));
}
