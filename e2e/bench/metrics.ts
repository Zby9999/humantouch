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
  /** For Cursor's glob: the folder it looks in, which is no path searched in the bench's counting. */
  folder?: string;
  /** For a Skill the Agent loads by name (Claude Code's Skill tool). */
  skill?: string;
  /** What the tool gave the Agent to read. */
  output: string;
  /** How long it was, when the transcript gives only that (Cursor, for a long file read). */
  size?: number;
}

export interface Transcript {
  /** The model the Agent ran on, as the Agent says at the start. */
  model: string | null;
  toolCalls: ToolCall[];
  /** The Agent's last words: where the report is. */
  finalText: string;
  /** Tool calls the bench's permissions turned away. */
  permissionDenials: number;
  /** Subagents the Agent started (Claude Code's Task, Cursor's explore), and the models other than its own they ran on. */
  subagents: { calls: number; models: string[] };
  /** Times the API did not answer and was asked again (Claude Code says so; Cursor does not): a wait that is no Agent's doing. */
  apiRetries: number;
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
  const transcript: Transcript = { model: null, toolCalls: [], finalText: "", permissionDenials: 0, subagents: { calls: 0, models: [] }, apiRetries: 0 };
  const byId = new Map<string, ToolCall>();
  for (const event of all) {
    if (event.type === "system" && event.subtype === "init") transcript.model = event.model ?? null;
    if (event.type === "system" && event.subtype === "api_retry") transcript.apiRetries++;
    if (event.type === "result") {
      transcript.finalText = event.result ?? "";
      transcript.permissionDenials = event.permission_denials?.length ?? 0;
      transcript.subagents.models = Object.keys(event.modelUsage ?? {}).filter((model) => model !== transcript.model);
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
  transcript.subagents.calls = transcript.toolCalls.filter((call) => call.name === "Task" || call.name === "Agent").length;
  return transcript;
}

/**
 * Cursor tells each tool call twice, as it starts and as it completes; only
 * the second has the result. Its `result` event has every message of the run
 * run together, so the last words are its last assistant message.
 */
function parseCursor(all: Event[]): Transcript {
  const transcript: Transcript = { model: null, toolCalls: [], finalText: "", permissionDenials: 0, subagents: { calls: 0, models: [] }, apiRetries: 0 };
  const others = new Set<string>();
  for (const event of all) {
    if (event.type === "system" && event.subtype === "init") transcript.model = event.model ?? null;
    else for (const model of modelsIn(event)) if (model !== transcript.model) others.add(model);
    if (event.type === "assistant") {
      const text = textOf(event.message?.content);
      if (text.trim()) transcript.finalText = text;
    }
    if (event.type !== "tool_call" || event.subtype !== "completed") continue;
    const [key, call] = Object.entries(event.tool_call ?? {})[0] ?? [];
    if (!key) continue;
    const { args = {}, result = {} } = call as Event;
    const name = key.replace(/ToolCall$/, "");
    if (/task|subagent|agent/i.test(name)) transcript.subagents.calls++;
    if (result.rejected || result.permissionDenied) transcript.permissionDenials++;
    const success = result.success;
    const text = success && [success.stdout, success.stderr, success.content].filter((part) => typeof part === "string").join("");
    // A long file read comes with no content: only its size.
    if (success && !text && typeof success.fileSize === "number" && name === "read") transcript.toolCalls.push({ name, ...where(args), output: "", size: success.fileSize });
    else transcript.toolCalls.push({ name, ...where(args), output: text || JSON.stringify(success ?? result) });
  }
  transcript.subagents.models = [...others];
  return transcript;
}

/** Every `model` named anywhere in an event. */
function modelsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(modelsIn);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === "model" && typeof inner === "string" ? [inner] : modelsIn(inner)));
}

/** A tool's input, as far as the bench looks at it: the command it runs, or the path it works on. */
function where(input: Event): Pick<ToolCall, "command" | "path" | "skill" | "folder"> {
  if (typeof input.command === "string") return { command: input.command };
  if (typeof input.skill === "string") return { skill: input.skill };
  const path = input.file_path ?? input.path;
  if (typeof path === "string") return { path };
  // Cursor's glob names the folder it looks in as its target.
  return typeof input.targetDirectory === "string" ? { folder: input.targetDirectory } : {};
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
  /** Calls that read the 03Kind package itself, in `node_modules` (its built code, its own Skill), rather than run its command line (ticket 65). */
  packageReads: number;
  /**
   * Characters the Agent read: of the Skill (loaded, or read as a file), of
   * `claim`'s output, and of every tool's output, those two included.
   */
  charsRead: { skill: number; claim: number; total: number };
}

/** The command line's commands in a shell command, each time it runs one: `npx 03kind done 2 && npx 03kind finish` runs two. */
function thirdKindCommands(command: string): string[] {
  return [...command.matchAll(/03kind(?:\.js)?\s+(claim|done|finish|last)\b/g)].map((match) => match[1]);
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

/** The Skill as `init` puts it in the project, or the package's own copy (`node_modules/03kind/skill/SKILL.md`), which an Agent with none in the project may find. */
const SKILL_FILE = /(skills\/03kind|03kind\/skill)\/SKILL\.md\b/;

/** The Skill, loaded by name, read as a file, or printed in the shell (`cat …/SKILL.md`). */
function readsTheSkill(call: ToolCall): boolean {
  return call.skill === "03kind" || SKILL_FILE.test(call.path ?? "") || (/^\s*(cat|head|sed|less)\b/.test(call.command ?? "") && SKILL_FILE.test(call.command ?? ""));
}

/** The package in the project's `node_modules`, as linked or in pnpm's store. */
const IN_PACKAGE = /node_modules\/(?:\.pnpm\/[^\s"'`]*?\/node_modules\/)?03kind(?:[\/\s"'`]|$)/;

/** A call that reads the package itself: not one that runs its command line, by `npx` or by its file. */
function readsThePackage(call: ToolCall): boolean {
  if (call.command !== undefined) return IN_PACKAGE.test(call.command) && !thirdKindCommands(call.command).length && !/03kind\/dist\/cli\.js["'\s]+(claim|done|finish|last)\b/.test(call.command);
  return IN_PACKAGE.test(call.path ?? call.folder ?? "");
}

export function toolCallStats(calls: ToolCall[]): ToolCallStats {
  const commands = calls.flatMap((call) => (call.command ? thirdKindCommands(call.command) : []));
  const sum = (some: ToolCall[]) => some.reduce((total, call) => total + (call.size ?? call.output.length), 0);
  return {
    toolCalls: calls.length,
    repoWideSearches: calls.filter(isRepoWideSearch).length,
    claims: commands.filter((command) => command === "claim").length,
    dones: commands.filter((command) => command === "done").length,
    finished: commands.includes("finish"),
    packageReads: calls.filter(readsThePackage).length,
    charsRead: {
      skill: sum(calls.filter(readsTheSkill)),
      claim: sum(calls.filter((call) => call.command !== undefined && thirdKindCommands(call.command).includes("claim"))),
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
 * Reads the last ✓ section of `text`, and the ⚠️ section after it (or the
 * last ⚠️ section alone, when no change was applied exactly). The
 * headings may be in the designer's language: the form is the marks, the
 * numbered lines, and under ⚠️ two indented lines for why and instead.
 */
export function checkReport(text: string, ids: number[]): ReportCheck {
  const lines = text.split("\n");
  const heading = (mark: RegExp) => lines.findLastIndex((line) => mark.test(line.trim()) && !ITEM.test(line));
  // Every change under ⚠️ is a report too: the ✓ section is left out when nothing was applied exactly.
  const applied = heading(/^\W*✓/);
  const start = applied >= 0 ? applied : heading(/^\W*⚠/);
  if (start < 0) return { compliant: false, applied: [], notApplied: [], problems: ["no ✓ or ⚠️ section"] };
  const listed: { id: number; warned: boolean; notes: number }[] = [];
  let warned = applied < 0;
  for (const line of lines.slice(start + 1)) {
    if (/⚠/.test(line) && !ITEM.test(line)) warned = true;
    const item = ITEM.exec(line);
    if (item) listed.push({ id: Number(item[1]), warned, notes: 0 });
    else if (/^\s+\S.*[:：]/.test(line) && listed.at(-1)?.warned) listed.at(-1)!.notes++;
  }
  const problems: string[] = [];
  const timesListed = (id: number) => listed.filter((item) => item.id === id).length;
  for (const id of new Set(listed.map((item) => item.id))) if (timesListed(id) > 1) problems.push(`change ${id} listed more than once`);
  for (const item of listed) if (item.warned && item.notes < 2) problems.push(`change ${item.id} under ⚠️ without both why and instead`);
  for (const id of ids) if (!timesListed(id)) problems.push(`change ${id} not listed`);
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
   * Agent's end, each bit of progress (a `done`, or a change newly shown on
   * the page), and each time the project's source changed.
   */
  times: { claim: number; finish: number | null; end: number; progress: number[]; edits: number[] };
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
  /** The longest wait between two bits of progress; null with fewer than two. */
  maxProgressGapMs: number | null;
  /**
   * The longest time, from the claim to the end of the round, with no
   * progress and no edit to the source: what ticket 67 calls stopped.
   */
  maxStillMs: number;
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
  const within = (moments: number[]) => moments.filter((t) => t >= times.claim && t <= end);
  const longestGap = (moments: number[]) => {
    const sorted = [...moments].sort((a, b) => a - b);
    return sorted.length < 2 ? null : Math.max(...sorted.slice(1).map((t, i) => t - sorted[i]));
  };
  return {
    applyMs,
    applyMsPerChange: applyMs / changes.length,
    checked: checkable.filter((change) => ["shown", "not shown"].includes(outcome(change.id) ?? "")).length,
    oneToOneByChecks: rate(checkable.filter((change) => outcome(change.id) === "shown").length, checkable.length),
    oneToOneByPage: rate(expected.filter((change) => change.shown).length, expected.length),
    falseChecks: report.applied.filter(notShown),
    maxProgressGapMs: longestGap(within(times.progress)),
    maxStillMs: longestGap([times.claim, ...within([...times.progress, ...times.edits]), end])!,
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

/**
 * Whether the Agent's diff writes one of `variables` (a Variable's class or
 * CSS variable) as a whole word (`md:text-5xl!` writes `text-5xl`; `text-5xl`
 * does not write `text-5`), more often in the lines it adds than in those it
 * takes out: a line rewritten for another change carries its classes along.
 */
export function usesVariable(diff: string, variables: string[]): boolean {
  const lines = diff.split("\n").filter((line) => !line.startsWith("+++") && !line.startsWith("---"));
  const count = (sign: string, name: string) => {
    const word = new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\w-])`, "g");
    return lines.filter((line) => line.startsWith(sign)).reduce((total, line) => total + (line.slice(1).match(word)?.length ?? 0), 0);
  };
  return variables.some((name) => count("+", name) > count("-", name));
}
