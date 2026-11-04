/**
 * What a run of the applying bench is measured by, from what the Agent left
 * behind: its transcript (stream-json, one event a line), the round as
 * archived, and when the page and the command line moved. Pure functions, so
 * a run's raw results can be measured again later, by a newer rule.
 */
import { DENIED } from "./allowlist.ts";

/** The Agents the bench runs. */
export type AgentName = "claude" | "cursor" | "pi";

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
  /** For one of fff's searches in pi (pi-fff, ticket 92), by the parameters the system prompt declares for its tool: grep and find in override mode, under the names of pi's own. */
  fff?: boolean;
}

export interface Transcript {
  /** The model the Agent ran on, as the Agent says at the start (pi: as its answers say; each model, joined by commas, when they do not all say the same). */
  model: string | null;
  /** The concrete models the provider answered with, where the transcript names them (pi's responseModel): for the record, not checked. */
  responseModels: string[];
  /** The skills the Agent was given at the start, by name, as it says (Claude Code's init, pi's system prompt; Cursor says none). */
  skills: string[];
  /** The tools pi was given at the start, by name, as its system prompt declares them: fff's among them (ticket 92). None for the others. */
  tools: string[];
  /** Of those, the ones that are fff's (pi-fff), by their parameters or their own names. */
  fffTools: string[];
  toolCalls: ToolCall[];
  /** The Agent's last words: where the report is. */
  finalText: string;
  /** Tool calls the bench's permissions (or, in pi, its extension) turned away. */
  permissionDenials: number;
  /** Subagents the Agent started (Claude Code's Task, Cursor's explore; pi has none of its own), and the models other than its own they ran on. */
  subagents: { calls: number; models: string[] };
  /** Times the API did not answer and was asked again (Claude Code and pi say so; Cursor does not): a wait that is no Agent's doing. */
  apiRetries: number;
}

type Event = Record<string, any>;

function emptyTranscript(): Transcript {
  return { model: null, responseModels: [], skills: [], tools: [], fffTools: [], toolCalls: [], finalText: "", permissionDenials: 0, subagents: { calls: 0, models: [] }, apiRetries: 0 };
}

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
  return agent === "claude" ? parseClaudeCode(events(text)) : agent === "pi" ? parsePi(events(text)) : parseCursor(events(text));
}

function parseClaudeCode(all: Event[]): Transcript {
  const transcript = emptyTranscript();
  const byId = new Map<string, ToolCall>();
  for (const event of all) {
    if (event.type === "system" && event.subtype === "init") {
      transcript.model = event.model ?? null;
      transcript.skills = event.skills ?? [];
    }
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
  const transcript = emptyTranscript();
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

/**
 * pi tells each message as it starts, as it streams and as it ends; only the
 * end is the whole of it. The first is the system prompt, with the skills it
 * lists and the tools it declares, fff's told from pi's own grep and find,
 * whose names they take in override mode, by their parameters: fff's have
 * `exclude` and `cursor`, pi's neither. The model is each answer's, as its
 * provider and id: pi says nothing of it before, and starts no subagent of
 * its own (nor does the bench give it an extension that does), so an answer
 * on another model is a switch, and the transcript names every model, which
 * is no Agent's pinned one. Each tool
 * call is in the answer that makes it, and what it got back in the tool
 * result after; one the bench's extension blocked is a tool result in error,
 * its text the bench's reason.
 */
function parsePi(all: Event[]): Transcript {
  const transcript = emptyTranscript();
  const byId = new Map<string, ToolCall>();
  const models = new Set<string>();
  const responseModels = new Set<string>();
  const fffTools = new Set<string>();
  let prompted = false;
  for (const event of all) {
    if (event.type === "auto_retry_start") transcript.apiRetries++;
    if (event.type !== "message_end") continue;
    const message: Event = event.message ?? {};
    if (message.role === "system" && !prompted) {
      prompted = true;
      const listed = /<available_skills>([\s\S]*?)<\/available_skills>/.exec(message.sections?.skills ?? "")?.[1] ?? "";
      transcript.skills = [...listed.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((match) => unescapeXml(match[1].trim()));
      transcript.tools = (message.toolsAdded ?? []).map((tool: Event) => tool.name);
      for (const tool of message.toolsAdded ?? []) if (FFF_TOOLS.test(tool.name) || (tool.parameters?.properties?.exclude && tool.parameters?.properties?.cursor)) fffTools.add(tool.name);
      transcript.fffTools = [...fffTools];
    }
    if (message.role === "assistant") {
      const model = message.provider ? `${message.provider}/${message.model}` : message.model;
      if (model) models.add(model);
      if (message.responseModel) responseModels.add(message.responseModel);
      const text = textOf(message.content);
      if (text.trim()) transcript.finalText = text;
      for (const part of message.content ?? []) {
        if (part.type !== "toolCall") continue;
        const call: ToolCall = { name: part.name, ...where(part.arguments ?? {}), ...(fffTools.has(part.name) && { fff: true }), output: "" };
        byId.set(part.id, call);
        transcript.toolCalls.push(call);
      }
    }
    if (message.role === "toolResult") {
      const output = textOf(message.content);
      const call = byId.get(message.toolCallId);
      if (call) call.output = output;
      if (message.isError && output.startsWith(DENIED)) transcript.permissionDenials++;
    }
  }
  transcript.model = models.size ? [...models].join(", ") : null;
  transcript.responseModels = [...responseModels];
  return transcript;
}

/** Text as XML escapes it in pi's system prompt. */
function unescapeXml(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => named[name]);
}

/** Every `model` named anywhere in an event. */
function modelsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(modelsIn);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === "model" && typeof inner === "string" ? [inner] : modelsIn(inner)));
}

/** A tool's input, as far as the bench looks at it: the command it runs, or the path it works on (fff-multi-grep's: the files it is held to). */
function where(input: Event): Pick<ToolCall, "command" | "path" | "skill" | "folder"> {
  if (typeof input.command === "string") return { command: input.command };
  if (typeof input.skill === "string") return { skill: input.skill };
  const path = input.file_path ?? input.path ?? input.constraints;
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
/** fff's search tools in pi (pi-fff, ticket 92) by the names that are theirs alone: beside pi's own (when fff does not index the folder pi runs in), and multi_grep in override mode. */
const FFF_TOOLS = /^(ffgrep|fffind|fff-multi-grep|multi_grep)$/;
const SHELL_SEARCH = /(^|[\s;&|(])(rg|ag|ack|fd|find|git\s+grep)\s|(^|[\s;&|(])grep\s+(-\w*[rR]\w*|--recursive)\b/;

/** A path that names one file: by its extension. */
const ONE_FILE = /\.[a-z0-9]+$/i;
/** One that fff takes for a file (query.ts, normalizePathConstraint): an extension of a letter, then up to nine letters or digits. `src/v1.2` is a folder. */
const FFF_ONE_FILE = /\.[a-zA-Z][a-zA-Z0-9]{0,9}$/;

/**
 * A search over the project or a folder of it: a search tool not given one
 * file, or a shell command that searches folders (`rg`, `find`, `git grep`,
 * `grep -r`). Goal: none (docs/goals.md, Light): the change notes say where
 * each change goes. fff's (pi's grep and find with pi-fff, ffgrep, fffind,
 * and the multi-greps) are judged alike, but their path may be a glob
 * (`*.tsx`, `src/**`), which names no one file: grep or find with no path, a
 * folder or a glob, and a multi-grep with no constraint, or any
 * but one file (`*.{ts,tsx} !test/`), search the project or a folder of it;
 * given one file, by a path with an extension and no glob, they do not
 * (a bare name, `App.tsx`, looks in every folder for it, as a search for
 * that one file).
 */
export function isRepoWideSearch(call: ToolCall): boolean {
  if (call.command !== undefined) return SHELL_SEARCH.test(call.command);
  if (call.fff || FFF_TOOLS.test(call.name)) {
    const path = call.path?.trim();
    // A glob, or more than one, or one left out.
    return path === undefined || /[*?[{\s!]/.test(path) || !FFF_ONE_FILE.test(path);
  }
  if (!SEARCH_TOOLS.test(call.name)) return false;
  return call.path === undefined || !ONE_FILE.test(call.path);
}

/** pi's search tools that pi-fff takes the place of, in override mode, under their names, or under its own. */
const REPLACED = ["grep", "find", "ffgrep", "fffind"];

/**
 * Why a run's tools are not what its record says it ran with, or null: one
 * that had pi-fff (`extensions`, from the run's record) whose transcript
 * declares no tool of fff's, or declares grep or find not as fff's (pi-fff
 * changed their parameters, say), would be judged by pi's own rule, wrong
 * in silence. The bench stops on it, as on another model.
 */
export function fffProblem(extensions: Record<string, string | null> | undefined, transcript: Transcript): string | null {
  if (!extensions || !("pi-fff" in extensions)) return null;
  const ran = `ran with pi-fff ${extensions["pi-fff"]}`;
  const notFff = transcript.tools.filter((tool) => REPLACED.includes(tool) && !transcript.fffTools.includes(tool));
  if (notFff.length) return `${ran}, but its transcript declares ${notFff.join(", ")} not as fff's (no exclude and cursor parameters)`;
  if (!transcript.fffTools.length) return `${ran}, but its transcript declares no tool of fff's`;
  return null;
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
  for (const item of listed) if (item.warned && item.notes < 2) problems.push(unexplained(item.id));
  for (const id of ids) if (!timesListed(id)) problems.push(`change ${id} not listed`);
  const unique = (warnedOnes: boolean) => [...new Set(listed.filter((item) => item.warned === warnedOnes).map((item) => item.id))];
  return { compliant: !problems.length, applied: unique(false), notApplied: unique(true), problems };
}

/** The problem of a change listed under ⚠️ without both lines, why and instead. */
const unexplained = (id: number) => `change ${id} under ⚠️ without both why and instead`;

/**
 * Of the changes a scenario knows cannot be applied 1:1 (ticket 86), the
 * share the report gives right: under ⚠️ alone, with why and instead; or
 * under ✓ alone with the page showing it (`shown`, by the scenario's own
 * test), an Agent that found a way after all. Null when the run has none.
 */
export function reportedAsExpected(report: ReportCheck, expected: { id: number; shown: boolean | null }[]): number | null {
  if (!expected.length) return null;
  const warned = (id: number) => report.notApplied.includes(id) && !report.applied.includes(id) && !report.problems.includes(unexplained(id));
  const applied = (id: number, shown: boolean | null) => report.applied.includes(id) && !report.notApplied.includes(id) && shown === true;
  return expected.filter(({ id, shown }) => warned(id) || applied(id, shown)).length / expected.length;
}

/** A change of the scenario, as the run left it. */
export interface ChangeOutcome {
  id: number;
  /** Whether the editor layer's page check can tell this kind of change (the notes' list: not a brief, a copy, …). */
  checkable: boolean;
  /** Whether the page shows it at the end, by the scenario's own expectation; null when the scenario has none (a brief). */
  shown: boolean | null;
  /** One the scenario knows cannot be applied 1:1 (ticket 86): in no 1:1 rate, but a false ✓ all the same when listed under ✓ and not shown. */
  notOneToOne?: boolean;
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
  /** 1:1 applied, by the page's checks (goals: the `done` check, not the Agent's word), of the changes the page can check and that can be applied 1:1; null with none. */
  oneToOneByChecks: number | null;
  /** 1:1 applied, by what the page shows at the end, of the changes the scenario has an expectation for and that can be applied 1:1; null with none. */
  oneToOneByPage: number | null;
  /** The two 1:1 rates' parts and wholes, to be summed up over runs (`pooled`), not taken run by run. */
  oneToOneCounts: { byChecks: { part: number; whole: number }; byPage: { part: number; whole: number } };
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
  const oneToOne = changes.filter((change) => !change.notOneToOne);
  const checkable = oneToOne.filter((change) => change.checkable);
  const outcome = (id: number) => checks[id]?.outcome;
  const expected = oneToOne.filter((change) => change.shown !== null);
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
  const byChecks = { part: checkable.filter((change) => outcome(change.id) === "shown").length, whole: checkable.length };
  const byPage = { part: expected.filter((change) => change.shown).length, whole: expected.length };
  return {
    applyMs,
    applyMsPerChange: applyMs / changes.length,
    checked: checkable.filter((change) => ["shown", "not shown"].includes(outcome(change.id) ?? "")).length,
    oneToOneByChecks: rate(byChecks.part, byChecks.whole),
    oneToOneByPage: rate(byPage.part, byPage.whole),
    oneToOneCounts: { byChecks, byPage },
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
 * A rate pooled over runs: the parts of each run summed, over their wholes
 * summed (goals: of all the changes with a Variable, the share that use it),
 * not a run's rate in the middle of the others'. Runs with none are left out;
 * null when none has any.
 */
export function pooled(counts: ({ part: number; whole: number } | null)[]): { rate: number | null; part: number; whole: number } {
  const part = counts.reduce((total, count) => total + (count?.part ?? 0), 0);
  const whole = counts.reduce((total, count) => total + (count?.whole ?? 0), 0);
  return { rate: whole ? part / whole : null, part, whole };
}

/**
 * The Variables a change is to write, as its scenario names them: one of a
 * list (`["text-brand", "--color-brand"]`: its class or its CSS variable),
 * or, for a value of several parts each its own Variable, a list of parts,
 * every one of them written, each one of its own list
 * (`[["pt-3"], ["pr-6"], …]`: a padding of four sides).
 */
export type VariableNames = string[] | string[][];

/** A change's Variables as the parts that must all be written, each one of its names. */
export function variableParts(variables: VariableNames): string[][] {
  return variables.every(Array.isArray) ? (variables as string[][]) : [variables as string[]];
}

/**
 * Whether the Agent's diff writes `variables` (see `VariableNames`): a name
 * counts as written as a whole word (`md:text-5xl!` writes `text-5xl`;
 * `text-5xl` does not write `text-5`), more often in the lines it adds than
 * in those it takes out: a line rewritten for another change carries its
 * classes along.
 */
export function usesVariable(diff: string, variables: VariableNames): boolean {
  const lines = diff.split("\n").filter((line) => !line.startsWith("+++") && !line.startsWith("---"));
  const count = (sign: string, name: string) => {
    const word = new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\w-])`, "g");
    return lines.filter((line) => line.startsWith(sign)).reduce((total, line) => total + (line.slice(1).match(word)?.length ?? 0), 0);
  };
  return variableParts(variables).every((names) => names.some((name) => count("+", name) > count("-", name)));
}

/**
 * Of a scenario's own expectations (ticket 86: an earlier round's changes kept, a
 * round undone), the share that hold at the end; null with none.
 */
export function scenarioExpectationsHold(expectations: { atEnd: boolean }[] | undefined): number | null {
  if (!expectations?.length) return null;
  return expectations.filter((expectation) => expectation.atEnd).length / expectations.length;
}
