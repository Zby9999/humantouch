/**
 * The applying bench, with real Agents: each standard scenario is designed in
 * the editor layer of a fresh copy of the example, an Agent applies it
 * unattended, and the run is measured from what it left behind. Pages open in
 * Playwright's headless shell only: nothing takes the designer's focus.
 *
 *   pnpm bench:agents [--agents claude,cursor] [--scenarios id,…] [--runs 3] [--max-runs n]
 *                     [--out <dir> --first-run n]   add runs n onward to the raw results in <dir>, as more of the same round of runs
 *   pnpm bench:agents --dry           set the scenarios up, run no Agent: each must make its changes, none shown yet
 *   pnpm bench:agents summary <dir>   measure the raw results in <dir> again, and sum them up
 *
 * Runs go one after another, never side by side, so their times compare,
 * run 1 of every scenario first; `--max-runs` stops after that many Agent
 * runs, and a run on another model than the Agent's pinned one stops them all. Raw
 * results go to `bench-results/agents/<when>/`, which git ignores.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sh } from "../tests/install-copy.ts";
import { agentVersion, AGENTS, commandLine, effortSeen, runAgent, type AgentRun } from "./agents.ts";
import { checkReport, measureRun, parseTranscript, summarize, toolCallStats, usesVariable, type AgentName } from "./metrics.ts";
import { recordUnclaimedNotices, unclaimedNoticesShown } from "./notices.ts";
import { cloneBase, prepareBase, startDevServer, type RunProject } from "./project.ts";
import { openObservers, SCENARIOS, shown, type SavedChange, type Scenario } from "./scenarios.ts";

/** Whether something answers on `port` of this machine, as a dev server there would. */
function answers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const RESULTS = fileURLToPath(new URL("../../bench-results/agents/", import.meta.url));
/** The bench's dev servers take ports from here, one run after another: apart from e2e's and the performance tests'. */
const FIRST_PORT = 5620;
const PORTS = 30;
/** Longest an Agent gets for a round. */
const AGENT_TIMEOUT_MS = 20 * 60_000;
/** How often the page is looked at for a change newly shown, and the round's files for a claim, a `done`, a finish. */
const SHOWN_POLL_MS = 1000;
const FILES_POLL_MS = 250;

/** What a run leaves for measuring, besides the transcript, the diff and the Agent's other output. */
interface RawRun {
  agent: AgentName;
  scenario: string;
  run: number;
  date: string;
  version: string;
  commandLine: string;
  /** The effort the command line sets, and, for Claude Code, the one its debug log shows the session ran at. */
  effort: { set: string; seen: string | null };
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  endedAt: number;
  /** Cursor's: the headless shell its browser plugins were given, or null (then Chrome, headless). */
  headlessShell?: string | null;
  /** Browsers that came up under the Agent with a window. */
  headedBrowsers: string[];
  changes: { id: number; kind: string; checkable: boolean; variable?: string[]; shownBefore: boolean | null; shownAtEnd: boolean | null }[];
  /**
   * How many times, from the Agent's start on, the designer's page showed the
   * notice that the code is changing but no Agent has claimed the changes
   * (ticket 66). Recorded only, never scored: before the claim it is the Agent
   * editing unclaimed, after it a false one. Missing in runs before ticket 66.
   */
  unclaimedNotices?: number;
  /** In ms since the epoch: the claim, each `done`, the finish, each change newly shown on the page, each edit to the project's source, and each time that notice showed. */
  times: { claim: number | null; dones: number[]; finish: number | null; shown: { id: number; at: number }[]; edits: number[]; unclaimedNotices?: number[] };
  /** The page's last check of each change, as the round was archived (or left, unfinished). */
  checks: Record<string, { outcome: string }>;
}

async function main(argv: string[]) {
  if (argv[0] === "summary") return writeSummary(argv[1]);
  const option = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const agents = (option("agents") ?? "claude,cursor").split(",") as AgentName[];
  const scenarios = option("scenarios") ? SCENARIOS.filter((scenario) => option("scenarios")!.split(",").includes(scenario.id)) : SCENARIOS;
  const runs = Number(option("runs") ?? 3);
  const firstRun = Number(option("first-run") ?? 1);
  const maxRuns = Number(option("max-runs") ?? Infinity);
  const dry = argv.includes("--dry");
  for (const agent of agents) if (!AGENTS[agent]) throw new Error(`No Agent ${agent}: claude or cursor`);

  const out = option("out") ?? join(RESULTS, new Date().toISOString().replace(/[:.]/g, "-"));
  const plan = dry ? scenarios.length : Math.min(maxRuns, agents.length * scenarios.length * runs);
  console.log(dry ? `Setting up ${plan} scenarios, with no Agent.` : `${plan} Agent runs: ${agents.join(", ")} × ${scenarios.length} scenarios × ${runs}. Raw results in ${out}`);

  const versions: Partial<Record<AgentName, string>> = {};
  if (!dry) {
    for (const agent of agents) versions[agent] = await agentVersion(agent);
    mkdirSync(out, { recursive: true });
    const each = <T,>(of: (agent: AgentName) => T) => Object.fromEntries(agents.map((agent) => [agent, of(agent)]));
    const meta = { versions, models: each((agent) => AGENTS[agent].model), efforts: each((agent) => AGENTS[agent].effort), commandLines: each(commandLine) };
    // Runs added to a round of runs compare with it only on the same Agent and command line.
    const before = existsSync(join(out, "meta.json")) ? JSON.parse(readFileSync(join(out, "meta.json"), "utf8")) : null;
    for (const agent of agents) {
      if (before?.commandLines?.[agent] && (before.commandLines[agent] !== meta.commandLines[agent] || before.versions[agent] !== versions[agent])) {
        throw new Error(`${out} has ${agent} runs by another command line or version: start a round of runs of their own`);
      }
    }
    const merged = before ? Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, { ...before[key], ...value }])) : meta;
    writeFileSync(join(out, "meta.json"), `${JSON.stringify(merged, null, 2)}\n`);
  }

  const { base, remove } = await prepareBase();
  const browser = await chromium.launch();
  let port = 0;
  /**
   * The next port of the bench's that nothing answers on: a dev server left
   * running there (by a run stopped by hand, say) would answer for the run's
   * own, and the run would measure the wrong project.
   */
  const nextPort = async () => {
    for (let tries = 0; tries < PORTS; tries++) {
      const candidate = FIRST_PORT + (port++ % PORTS);
      if (!(await answers(candidate))) return candidate;
      console.log(`Port ${candidate} is in use already: skipped`);
    }
    throw new Error(`Every port from ${FIRST_PORT} to ${FIRST_PORT + PORTS - 1} is in use`);
  };
  const failures: string[] = [];
  try {
    if (dry) {
      for (const scenario of scenarios) {
        const problems = await setUp(browser, base, await nextPort(), scenario);
        console.log(`${problems.length ? "✗" : "✓"} ${scenario.id}${problems.map((problem) => `\n    ${problem}`).join("")}`);
        failures.push(...problems);
      }
    } else {
      let agentRuns = 0;
      let stop: string | null = null;
      for (let run = firstRun; run < firstRun + runs && !stop; run++) {
        for (const scenario of scenarios) {
          for (const agent of agents) {
            if (stop || agentRuns >= maxRuns) break;
            const folder = join(out, agent, scenario.id, `run-${run}`);
            if (existsSync(join(folder, "raw.json"))) throw new Error(`${folder} has a run already`);
            mkdirSync(folder, { recursive: true });
            const started = Date.now();
            try {
              await runOnce({ browser, base, port: await nextPort(), scenario, agent, run, version: versions[agent]!, folder });
              agentRuns++;
              const measures = measureFolder(folder);
              console.log(`${agent} ${scenario.id} #${run}: ${Math.round((Date.now() - started) / 1000)}s, ${oneLine(measures)}`);
              if (measures.model !== AGENTS[agent].model) stop = `${agent} ran on ${measures.model}, not ${AGENTS[agent].model}: stopped`;
            } catch (error) {
              // The Agent ran, and counts against the limit, once it has a transcript.
              if (existsSync(join(folder, "transcript.jsonl"))) agentRuns++;
              failures.push(`${agent} ${scenario.id} #${run}: ${(error as Error).message}`);
              console.log(`✗ ${agent} ${scenario.id} #${run}: ${(error as Error).message}`);
              writeFileSync(join(folder, "error.txt"), `${(error as Error).stack}\n`);
              // The browser gone (the bench stopped from outside, say): no run after this can set its scenario up.
              if (!browser.isConnected()) stop = "the browser closed: stopped";
            }
          }
        }
      }
      if (stop) {
        failures.push(stop);
        console.log(`✗ ${stop}`);
      }
      console.log(`${agentRuns} Agent runs.`);
      writeSummary(out);
    }
  } finally {
    await browser.close();
    remove();
  }
  if (failures.length) process.exitCode = 1;
}

/**
 * A fresh copy of the project, its dev server, and the scenario designed on
 * it in the editor layer, as a designer has it, with pages beside that only
 * look; `work` goes on from there. All of it is taken down after.
 */
async function withScenario<T>(
  browser: Browser,
  base: string,
  port: number,
  scenario: Scenario,
  work: (round: { project: RunProject; saved: SavedChange[]; observers: Map<number, Page>; designer: Page }) => Promise<T>,
): Promise<T> {
  const project = await cloneBase(base);
  let server: Awaited<ReturnType<typeof startDevServer>> | null = null;
  let context: BrowserContext | null = null;
  let observers: Awaited<ReturnType<typeof openObservers>> | null = null;
  try {
    server = await startDevServer(project.dir, port);
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("vernierkit:layers-panel", "shown"));
    await recordUnclaimedNotices(context);
    const page = await context.newPage();
    await page.goto(server.url);
    await page.locator("main").waitFor();
    observers = await openObservers(browser, scenario, server.url);
    await scenario.design({ page, cli: project.cli, edit: project.edit, settle: project.settle, changeSet: project.changeSet });
    return await work({ project, saved: project.changeSet()!.changes, observers: observers.pages, designer: page });
  } finally {
    await observers?.close().catch(() => {});
    await context?.close().catch(() => {});
    server?.stop();
    project.remove();
  }
}

/** Sets a scenario up with no Agent; what is wrong with it: changes not as it names them, or shown on the page already. */
async function setUp(browser: Browser, base: string, port: number, scenario: Scenario): Promise<string[]> {
  try {
    return await withScenario(browser, base, port, scenario, async ({ saved, observers, designer }) => {
      const problems: string[] = [];
      // Designing touches no code with no claim: the editor layer has no cause to ask.
      const notices = (await unclaimedNoticesShown(designer)).length;
      if (notices) problems.push(`the notice that no Agent claimed the changes showed ${notices} times as it was set up`);
      const kinds = saved.map((change) => change.kind).join(", ");
      const named = scenario.changes.map((change) => change.kind).join(", ");
      if (kinds !== named) problems.push(`changes are ${kinds}, not ${named}`);
      (await shown(observers, scenario, saved)).forEach((shows, i) => shows && problems.push(`change ${i + 1} shows before it is applied`));
      return problems;
    });
  } catch (error) {
    return [(error as Error).message.split("\n")[0]];
  }
}

/** The newest file under `dir`, by when it changed, in ms; `node_modules` and dot folders left out. */
function lastEdited(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? lastEdited(path) : statSync(path).mtimeMs);
  }
  return newest;
}

/** One Agent run of one scenario, its raw results written to `folder`. */
async function runOnce({ browser, base, port, scenario, agent, run, version, folder }: { browser: Browser; base: string; port: number; scenario: Scenario; agent: AgentName; run: number; version: string; folder: string }) {
  await withScenario(browser, base, port, scenario, async ({ project, saved, observers, designer }) => {
    const head = await project.head();
    writeFileSync(join(folder, "changeset.json"), `${JSON.stringify({ changes: saved }, null, 2)}\n`);
    const before = await shown(observers, scenario, saved);

    // While the Agent works: the claim, each done and the finish from the round's files; each source edit; each change newly shown on the page.
    const times: RawRun["times"] = { claim: null, dones: [], finish: null, shown: [], edits: [] };
    const vernier = join(project.dir, ".vernier");
    const readJson = (file: string) => {
      try {
        return JSON.parse(readFileSync(join(vernier, file), "utf8"));
      } catch {
        return null; // Not there, or being written.
      }
    };
    const rounds = () => (existsSync(join(vernier, "history")) ? readdirSync(join(vernier, "history")).sort() : []);
    // The put-back scenario archived a round before the Agent started.
    const roundsBefore = rounds().length;
    /** This round's result, once archived in full: `finish` writes it last into its folder. */
    const archived = () => (rounds().length > roundsBefore ? readJson(`history/${rounds().at(-1)}/result.json`) : null);
    let lastAsk: string | null = null;
    let lastState: unknown = null;
    let lastEdit = lastEdited(project.dir);
    const watchFiles = () => {
      const state = readJson("state.json");
      if (state) lastState = state;
      if (state && times.claim === null) times.claim = Date.parse(state.claimedAt);
      if (state?.check && state.check.at !== lastAsk) {
        lastAsk = state.check.at;
        times.dones.push(Date.parse(state.check.at));
      }
      const result = times.finish === null ? archived() : null;
      if (result) times.finish = Date.parse(result.at);
      const edited = lastEdited(project.dir);
      if (edited > lastEdit) times.edits.push((lastEdit = edited));
    };
    // Each change once, the first time it shows: a page reloading as the dev server brings an edit in shows nothing for a moment.
    const seen = new Set(saved.filter((_, i) => before[i]).map((change) => change.id));
    let looking = Promise.resolve();
    const lookAtThePage = () => {
      looking = looking.then(async () => {
        const now = await shown(observers, scenario, saved);
        const at = Date.now();
        now.forEach((shows, i) => {
          if (!shows || seen.has(saved[i].id)) return;
          seen.add(saved[i].id);
          times.shown.push({ id: saved[i].id, at });
        });
      });
    };
    const fileTimer = setInterval(() => {
      try {
        watchFiles();
      } catch (error) {
        console.error("Bench:", error);
      }
    }, FILES_POLL_MS);
    const pageTimer = setInterval(lookAtThePage, SHOWN_POLL_MS);
    let agentRun: AgentRun;
    try {
      agentRun = await runAgent(agent, project.dir, folder, AGENT_TIMEOUT_MS);
    } finally {
      clearInterval(fileTimer);
      clearInterval(pageTimer);
      await looking;
    }
    watchFiles();
    times.unclaimedNotices = await unclaimedNoticesShown(designer, agentRun.startedAt);

    // The end: the dev server brings the last edits in, and the page is loaded afresh.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.all([...observers.values()].map((page) => page.reload().then(() => page.locator("main").waitFor())));
    const atEnd = await shown(observers, scenario, saved);
    const result = archived();
    const checks = result?.checks ?? readJson("checks.json")?.results ?? {};
    if (result) writeFileSync(join(folder, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    else if (lastState) writeFileSync(join(folder, "state.json"), `${JSON.stringify(lastState, null, 2)}\n`);
    await sh("git", ["add", "-A"], project.dir);
    writeFileSync(join(folder, "diff.patch"), await sh("git", ["diff", "--cached", head], project.dir));

    const raw: RawRun = {
      agent,
      scenario: scenario.id,
      run,
      date: new Date(agentRun.startedAt).toISOString(),
      version,
      commandLine: commandLine(agent),
      effort: { set: AGENTS[agent].effort, seen: agent === "claude" ? effortSeen(folder) : null },
      ...agentRun,
      unclaimedNotices: times.unclaimedNotices.length,
      changes: scenario.changes.map((change, i) => ({
        id: saved[i].id,
        kind: change.kind,
        checkable: change.checkable,
        ...(change.variable && { variable: change.variable }),
        shownBefore: before[i],
        shownAtEnd: atEnd[i],
      })),
      times,
      checks: Object.fromEntries(Object.entries(checks).map(([id, check]) => [id, { outcome: (check as { outcome: string }).outcome }])),
    };
    writeFileSync(join(folder, "raw.json"), `${JSON.stringify(raw, null, 2)}\n`);
    if (raw.headedBrowsers.length > 0) console.error(`Bench: ${agent} opened a browser with a window in ${folder}: see headedBrowsers in raw.json`);
  });
}

/** A run's measures, from its folder: the numbers the bench compares. */
export function measureFolder(folder: string) {
  const saved: RawRun = JSON.parse(readFileSync(join(folder, "raw.json"), "utf8"));
  // What the page can check, and the Variables, as the scenario has them now: a rule fixed since is measured by.
  const scenario = SCENARIOS.find((s) => s.id === saved.scenario);
  const raw: RawRun = {
    ...saved,
    changes: saved.changes.map((change, i) => {
      const now = scenario?.changes[i];
      return now?.kind === change.kind ? { ...change, checkable: now.checkable, variable: now.variable } : change;
    }),
  };
  const transcript = parseTranscript(raw.agent, readFileSync(join(folder, "transcript.jsonl"), "utf8"));
  const stats = toolCallStats(transcript.toolCalls);
  const ids = raw.changes.map((change) => change.id);
  const report = checkReport(transcript.finalText, ids);
  const count = raw.changes.length;
  const diff = readFileSync(join(folder, "diff.patch"), "utf8");
  const withVariable = raw.changes.filter((change) => change.variable);
  const usedVariable = withVariable.filter((change) => usesVariable(diff, change.variable!));
  const round =
    raw.times.claim === null
      ? null
      : measureRun({
          changes: raw.changes.map((change) => ({ id: change.id, checkable: change.checkable, shown: change.shownAtEnd })),
          checks: raw.checks,
          report,
          times: { claim: raw.times.claim, finish: raw.times.finish, end: raw.endedAt, progress: [...raw.times.dones, ...raw.times.shown.map((event) => event.at)], edits: raw.times.edits ?? [] },
        });
  return {
    agent: raw.agent,
    scenario: raw.scenario,
    run: raw.run,
    date: raw.date,
    version: raw.version,
    model: transcript.model,
    changes: count,
    exitCode: raw.exitCode,
    timedOut: raw.timedOut,
    agentMs: raw.endedAt - raw.startedAt,
    claimed: raw.times.claim !== null,
    ranDone: stats.dones > 0,
    ranFinish: raw.times.finish !== null,
    dones: stats.dones,
    toolCalls: stats.toolCalls,
    toolCallsPerChange: stats.toolCalls / count,
    repoWideSearches: stats.repoWideSearches,
    charsRead: stats.charsRead,
    permissionDenials: transcript.permissionDenials,
    subagents: transcript.subagents,
    apiRetries: transcript.apiRetries,
    effort: raw.effort ?? null,
    applyMs: round?.applyMs ?? null,
    applyMsPerChange: round?.applyMsPerChange ?? null,
    checked: round?.checked ?? null,
    checkable: raw.changes.filter((change) => change.checkable).length,
    oneToOneByChecks: round?.oneToOneByChecks ?? null,
    oneToOneByPage: round?.oneToOneByPage ?? null,
    falseChecks: round?.falseChecks ?? [],
    maxProgressGapMs: round?.maxProgressGapMs ?? null,
    maxStillMs: round?.maxStillMs ?? null,
    reportCompliant: report.compliant,
    reportProblems: report.problems,
    variableUse: withVariable.length ? usedVariable.length / withVariable.length : null,
    /** A scenario test that held before the Agent started is a broken test, not a change applied. */
    shownBefore: raw.changes.filter((change) => change.shownBefore).map((change) => change.id),
  };
}

type Measures = ReturnType<typeof measureFolder>;

/** One line on a run, as it ends. */
function oneLine(m: Measures): string {
  const seconds = (ms: number | null) => (ms === null ? "–" : `${Math.round(ms / 1000)}s`);
  const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);
  return `round ${seconds(m.applyMs)}, ${m.toolCalls} tool calls, 1:1 ${percent(m.oneToOneByPage)} (checks ${percent(m.oneToOneByChecks)}), done ${m.ranDone ? "✓" : "✗"}, finish ${m.ranFinish ? "✓" : "✗"}, report ${m.reportCompliant ? "✓" : "✗"}`;
}

/** The numbers each Agent is compared by, from a run's measures. */
const METRICS: [string, (m: Measures) => number | null][] = [
  ["整轮用时 claim→finish（秒）", (m) => (m.applyMs === null ? null : m.applyMs / 1000)],
  ["整轮用时每条（秒）", (m) => (m.applyMsPerChange === null ? null : m.applyMsPerChange / 1000)],
  ["Agent 总用时（秒）", (m) => m.agentMs / 1000],
  ["每条平均工具调用", (m) => m.toolCallsPerChange],
  ["全仓搜索次数", (m) => m.repoWideSearches],
  ["读入字数：Skill", (m) => m.charsRead.skill],
  ["读入字数：claim 输出", (m) => m.charsRead.claim],
  ["读入字数：全部工具输出", (m) => m.charsRead.total],
  ["1:1 落地率（页面预期）", (m) => m.oneToOneByPage],
  ["1:1 落地率（done 核对）", (m) => m.oneToOneByChecks],
  ["虚假的 ✓（条）", (m) => m.falseChecks.length],
  ["跑了 done（比例）", (m) => Number(m.ranDone)],
  ["跑了 finish（比例）", (m) => Number(m.ranFinish)],
  ["报告格式合规（比例）", (m) => Number(m.reportCompliant)],
  ["设计变量使用率", (m) => m.variableUse],
  ["两次进度最长间隔（秒）", (m) => (m.maxProgressGapMs === null ? null : m.maxProgressGapMs / 1000)],
  ["没进度也没改源码的最长时间（秒）", (m) => (m.maxStillMs === null ? null : m.maxStillMs / 1000)],
  ["被权限拦下的工具调用", (m) => m.permissionDenials],
  ["子 Agent 调用", (m) => m.subagents.calls],
  ["API 重试", (m) => m.apiRetries],
];

/** The numbers the table by scenario shows. */
const BY_SCENARIO = ["整轮用时每条（秒）", "每条平均工具调用", "1:1 落地率（页面预期）", "虚假的 ✓（条）", "两次进度最长间隔（秒）", "没进度也没改源码的最长时间（秒）"];

/** Measures every run in `out` again, and writes `summary.json` and `summary.md` beside them. */
function writeSummary(out: string) {
  const measures: Measures[] = [];
  for (const agent of readdirSync(out).filter((name) => name in AGENTS)) {
    for (const scenario of readdirSync(join(out, agent)))
      for (const run of readdirSync(join(out, agent, scenario))) {
        const folder = join(out, agent, scenario, run);
        if (existsSync(join(folder, "raw.json"))) measures.push(measureFolder(folder));
      }
  }
  const round = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);
  const sum = (some: Measures[]) =>
    Object.fromEntries(
      METRICS.map(([name, of]) => {
        const values = some.map(of);
        const s = summarize(values);
        // A yes or no is summed up by how often it is yes.
        const share = name.endsWith("（比例）") && s.n ? values.reduce((total: number, value) => total + (value ?? 0), 0) / s.n : null;
        return [name, { median: round(s.median), min: round(s.min), max: round(s.max), n: s.n, share: round(share) }];
      }),
    );
  const agents = [...new Set(measures.map((m) => m.agent))];
  const summary = agents.map((agent) => {
    const mine = measures.filter((m) => m.agent === agent);
    return {
      agent,
      versions: [...new Set(mine.map((m) => m.version))],
      models: [...new Set(mine.map((m) => m.model))],
      subagentModels: [...new Set(mine.flatMap((m) => m.subagents.models))],
      efforts: [...new Set(mine.map((m) => (m.effort ? `${m.effort.set}${m.effort.seen ? `, seen ${m.effort.seen}` : ""}` : "?")))],
      runs: mine.length,
      dates: [...new Set(mine.map((m) => m.date.slice(0, 10)))],
      overall: sum(mine),
      scenarios: Object.fromEntries([...new Set(mine.map((m) => m.scenario))].map((scenario) => [scenario, sum(mine.filter((m) => m.scenario === scenario))])),
      brokenTests: mine.filter((m) => m.shownBefore.length).map((m) => `${m.scenario} #${m.run}: ${m.shownBefore.join(", ")}`),
    };
  });
  writeFileSync(join(out, "measures.json"), `${JSON.stringify(measures, null, 2)}\n`);
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const cell = (s: { median: number | null; min: number | null; max: number | null; share: number | null }) =>
    s.share !== null ? `${Math.round(s.share * 100)}%` : s.median === null ? "–" : `${s.median}（${s.min}–${s.max}）`;
  const md = summary
    .map((agent) =>
      [
        `## ${agent.agent}：${agent.versions.join(", ")}，模型 ${agent.models.join(", ")}，effort ${agent.efforts.join("; ")}，子 Agent 模型 ${agent.subagentModels.join(", ") || "无"}，${agent.runs} 次，${agent.dates.join(", ")}`,
        "",
        "| 指标 | 中位数（范围） | 次数 |",
        "|---|---|---|",
        ...METRICS.map(([name]) => `| ${name} | ${cell(agent.overall[name])} | ${agent.overall[name].n} |`),
        "",
        `| 场景 | ${BY_SCENARIO.join(" | ")} |`,
        `|---|${"---|".repeat(BY_SCENARIO.length)}`,
        ...Object.entries(agent.scenarios).map(([scenario, s]) => `| ${scenario} | ${BY_SCENARIO.map((name) => cell(s[name])).join(" | ")} |`),
        ...(agent.brokenTests.length ? ["", `场景的预期在 Agent 开始前就成立（测试有误）：${agent.brokenTests.join("; ")}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
  writeFileSync(join(out, "summary.md"), `${md}\n`);
  console.log(`\n${md}\n\nRaw results and measures: ${out}`);
}

await main(process.argv.slice(2));
