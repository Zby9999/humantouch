/**
 * The applying bench, with real Agents: each standard scenario is designed in
 * the editor layer of a fresh copy of the example, an Agent applies it
 * unattended, and the run is measured from what it left behind. Pages open in
 * Playwright's headless shell only: nothing takes the designer's focus.
 *
 *   pnpm bench:agents [--agents claude,cursor] [--scenarios id,…] [--runs 3]
 *   pnpm bench:agents --dry           set the scenarios up, run no Agent: each must make its changes, none shown yet
 *   pnpm bench:agents summary <dir>   measure the raw results in <dir> again, and sum them up
 *
 * Runs go one after another, never side by side, so their times compare. Raw
 * results go to `bench-results/agents/<when>/`, which git ignores.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sh } from "../tests/install-copy.ts";
import { agentVersion, AGENTS, commandLine, runAgent } from "./agents.ts";
import { addedLines, checkReport, measureRun, parseTranscript, summarize, toolCallStats, usesVariable, type AgentName } from "./metrics.ts";
import { cloneBase, prepareBase, startDevServer, type RunProject } from "./project.ts";
import { SCENARIOS, shown, widthsOf, type SavedChange, type Scenario } from "./scenarios.ts";

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
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  endedAt: number;
  changes: { id: number; kind: string; checkable: boolean; variable?: string[]; shownBefore: boolean | null; shownAtEnd: boolean | null }[];
  /** In ms since the epoch: the claim, each `done`, the finish, and each change newly shown on the page. */
  times: { claim: number | null; dones: number[]; finish: number | null; shown: { id: number; at: number }[] };
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
  const dry = argv.includes("--dry");
  for (const agent of agents) if (!AGENTS[agent]) throw new Error(`No Agent ${agent}: claude or cursor`);

  const out = join(RESULTS, new Date().toISOString().replace(/[:.]/g, "-"));
  const plan = dry ? scenarios.length : agents.length * scenarios.length * runs;
  console.log(dry ? `Setting up ${plan} scenarios, with no Agent.` : `${plan} Agent runs: ${agents.join(", ")} × ${scenarios.length} scenarios × ${runs}. Raw results in ${out}`);

  const versions: Partial<Record<AgentName, string>> = {};
  if (!dry) {
    for (const agent of agents) versions[agent] = await agentVersion(agent);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "meta.json"), `${JSON.stringify({ versions, commandLines: Object.fromEntries(agents.map((agent) => [agent, commandLine(agent)])) }, null, 2)}\n`);
  }

  const { base, remove } = await prepareBase();
  const browser = await chromium.launch();
  let port = 0;
  const failures: string[] = [];
  try {
    if (dry) {
      for (const scenario of scenarios) {
        const problems = await setUp(browser, base, FIRST_PORT + (port++ % PORTS), scenario);
        console.log(`${problems.length ? "✗" : "✓"} ${scenario.id}${problems.map((problem) => `\n    ${problem}`).join("")}`);
        failures.push(...problems);
      }
    } else {
      for (let run = 1; run <= runs; run++) {
        for (const scenario of scenarios) {
          for (const agent of agents) {
            const folder = join(out, agent, scenario.id, `run-${run}`);
            mkdirSync(folder, { recursive: true });
            const started = Date.now();
            try {
              await runOnce({ browser, base, port: FIRST_PORT + (port++ % PORTS), scenario, agent, run, version: versions[agent]!, folder });
              const measures = measureFolder(folder);
              console.log(`${agent} ${scenario.id} #${run}: ${Math.round((Date.now() - started) / 1000)}s, ${describe(measures)}`);
            } catch (error) {
              failures.push(`${agent} ${scenario.id} #${run}: ${(error as Error).message}`);
              console.log(`✗ ${agent} ${scenario.id} #${run}: ${(error as Error).message}`);
              writeFileSync(join(folder, "error.txt"), `${(error as Error).stack}\n`);
            }
          }
        }
      }
      writeSummary(out);
    }
  } finally {
    await browser.close();
    remove();
  }
  if (failures.length) process.exitCode = 1;
}

/** A desk on a fresh copy of the project: its page, with the editor layer as a designer has it. */
async function openDesk(browser: Browser, project: RunProject, url: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("vernierkit:layers-panel", "shown"));
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("main").waitFor();
  return { context, page, desk: { page, cli: project.cli, edit: project.edit, settle: project.settle, changeSet: project.changeSet } };
}

/**
 * Pages that only look: one at each width the scenario's tests run at, with
 * the editor layer kept from the local service, so they are no pages of the
 * designer's for the round's checks.
 */
async function openObservers(browser: Browser, scenario: Scenario, url: string) {
  const widths = widthsOf(scenario);
  const contexts: BrowserContext[] = [];
  const pages = new Map<number, Page>();
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 720 }, reducedMotion: "reduce" });
    await context.route((target) => target.hostname === "127.0.0.1", (route) => route.abort());
    const page = await context.newPage();
    await page.goto(url);
    await page.locator("main").waitFor();
    contexts.push(context);
    pages.set(width, page);
  }
  return { pages, close: () => Promise.all(contexts.map((context) => context.close())) };
}

/** Sets a scenario up with no Agent; what is wrong with it: changes not as it names them, or shown on the page already. */
async function setUp(browser: Browser, base: string, port: number, scenario: Scenario): Promise<string[]> {
  const project = await cloneBase(base);
  const server = await startDevServer(project.dir, port);
  const { context, desk } = await openDesk(browser, project, server.url);
  const observers = await openObservers(browser, scenario, server.url);
  try {
    await scenario.design(desk);
    const saved: SavedChange[] = project.changeSet()!.changes;
    const problems: string[] = [];
    const kinds = saved.map((change) => change.kind).join(", ");
    const named = scenario.changes.map((change) => change.kind).join(", ");
    if (kinds !== named) problems.push(`changes are ${kinds}, not ${named}`);
    (await shown(observers.pages, scenario, saved)).forEach((shows, i) => shows && problems.push(`change ${i + 1} shows before it is applied`));
    return problems;
  } catch (error) {
    return [(error as Error).message.split("\n")[0]];
  } finally {
    await observers.close();
    await context.close();
    server.stop();
    project.remove();
  }
}

async function runOnce({ browser, base, port, scenario, agent, run, version, folder }: { browser: Browser; base: string; port: number; scenario: Scenario; agent: AgentName; run: number; version: string; folder: string }) {
  const project = await cloneBase(base);
  const server = await startDevServer(project.dir, port);
  const { context, desk } = await openDesk(browser, project, server.url);
  const observers = await openObservers(browser, scenario, server.url);
  try {
    await scenario.design(desk);
    const head = await project.head();
    const saved: SavedChange[] = project.changeSet()!.changes;
    writeFileSync(join(folder, "changeset.json"), `${JSON.stringify({ changes: saved }, null, 2)}\n`);
    const before = await shown(observers.pages, scenario, saved);

    // While the Agent works: the claim, each done and the finish from the round's files; each change newly shown from the page.
    const times: RawRun["times"] = { claim: null, dones: [], finish: null, shown: [] };
    const vernier = join(project.dir, ".vernier");
    const readJson = (file: string) => {
      try {
        return JSON.parse(readFileSync(join(vernier, file), "utf8"));
      } catch {
        return null;
      }
    };
    const archived = () => {
      const rounds = existsSync(join(vernier, "history")) ? readdirSync(join(vernier, "history")).sort() : [];
      // The round before, in the put-back scenario, was archived before the Agent started.
      return rounds.length ? readJson(`history/${rounds.at(-1)}/result.json`) : null;
    };
    const roundsBefore = existsSync(join(vernier, "history")) ? readdirSync(join(vernier, "history")).length : 0;
    let lastAsk: string | null = null;
    let lastState: { done: number[]; check?: { at: string } } | null = null;
    const watchFiles = () => {
      const state = readJson("state.json");
      if (state) lastState = state;
      if (state && times.claim === null) times.claim = Date.parse(state.claimedAt);
      if (state?.check && state.check.at !== lastAsk) {
        lastAsk = state.check.at;
        times.dones.push(Date.parse(state.check.at));
      }
      const rounds = existsSync(join(vernier, "history")) ? readdirSync(join(vernier, "history")).length : 0;
      if (times.finish === null && rounds > roundsBefore) times.finish = Date.parse(archived().at);
    };
    // Each change once, the first time it shows: a page reloading as the dev server brings an edit in shows nothing for a moment.
    const seen = new Set(saved.filter((_, i) => before[i]).map((change) => change.id));
    let looking = Promise.resolve();
    const lookAtThePage = () => {
      looking = looking.then(async () => {
        const now = await shown(observers.pages, scenario, saved);
        const at = Date.now();
        now.forEach((shows, i) => {
          if (!shows || seen.has(saved[i].id)) return;
          seen.add(saved[i].id);
          times.shown.push({ id: saved[i].id, at });
        });
      });
    };
    const fileTimer = setInterval(watchFiles, FILES_POLL_MS);
    const pageTimer = setInterval(lookAtThePage, SHOWN_POLL_MS);
    const agentRun = await runAgent(agent, project.dir, join(folder, "transcript.jsonl"), join(folder, "agent.log"), AGENT_TIMEOUT_MS);
    clearInterval(fileTimer);
    clearInterval(pageTimer);
    await looking;
    watchFiles();

    // The end: the dev server brings the last edits in, and the page is loaded afresh.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.all([...observers.pages.values()].map((page) => page.reload().then(() => page.locator("main").waitFor())));
    const atEnd = await shown(observers.pages, scenario, saved);
    const result = times.finish === null ? null : archived();
    const checks = result?.checks ?? readJson("checks.json")?.results ?? {};
    if (!result && lastState) writeFileSync(join(folder, "state.json"), `${JSON.stringify(lastState, null, 2)}\n`);
    if (result) writeFileSync(join(folder, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    await sh("git", ["add", "-A"], project.dir);
    writeFileSync(join(folder, "diff.patch"), await sh("git", ["diff", "--cached", head], project.dir));

    const raw: RawRun = {
      agent,
      scenario: scenario.id,
      run,
      date: new Date(agentRun.startedAt).toISOString(),
      version,
      commandLine: commandLine(agent),
      ...agentRun,
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
  } finally {
    await observers.close();
    await context.close();
    server.stop();
    project.remove();
  }
}

/** A run's measures, from its folder: the numbers the bench compares. */
export function measureFolder(folder: string) {
  const raw: RawRun = JSON.parse(readFileSync(join(folder, "raw.json"), "utf8"));
  const transcript = parseTranscript(raw.agent, readFileSync(join(folder, "transcript.jsonl"), "utf8"));
  const stats = toolCallStats(transcript.toolCalls);
  const ids = raw.changes.map((change) => change.id);
  const report = checkReport(transcript.finalText, ids);
  const count = raw.changes.length;
  const added = addedLines(readFileSync(join(folder, "diff.patch"), "utf8"));
  const withVariable = raw.changes.filter((change) => change.variable);
  const usedVariable = withVariable.filter((change) => usesVariable(added, change.variable!));
  const round =
    raw.times.claim === null
      ? null
      : measureRun({
          changes: raw.changes.map((change) => ({ id: change.id, checkable: change.checkable, shown: change.shownAtEnd })),
          checks: raw.checks,
          report,
          times: { claim: raw.times.claim, finish: raw.times.finish, end: raw.endedAt, progress: [...raw.times.dones, ...raw.times.shown.map((event) => event.at)] },
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
    applyMs: round?.applyMs ?? null,
    applyMsPerChange: round?.applyMsPerChange ?? null,
    checked: round?.checked ?? null,
    checkable: raw.changes.filter((change) => change.checkable).length,
    oneToOneByChecks: round?.oneToOneByChecks ?? null,
    oneToOneByPage: round?.oneToOneByPage ?? null,
    falseChecks: round?.falseChecks ?? [],
    maxProgressGapMs: round?.maxProgressGapMs ?? null,
    reportCompliant: report.compliant,
    reportProblems: report.problems,
    variableUse: withVariable.length ? usedVariable.length / withVariable.length : null,
    /** A scenario test that held before the Agent started is a broken test, not a change applied. */
    shownBefore: raw.changes.filter((change) => change.shownBefore).map((change) => change.id),
  };
}

type Measures = ReturnType<typeof measureFolder>;

function describe(m: Measures): string {
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
  ["跑了 done", (m) => Number(m.ranDone)],
  ["跑了 finish", (m) => Number(m.ranFinish)],
  ["报告格式合规", (m) => Number(m.reportCompliant)],
  ["设计变量使用率", (m) => m.variableUse],
  ["两次进度最长间隔（秒）", (m) => (m.maxProgressGapMs === null ? null : m.maxProgressGapMs / 1000)],
  ["被权限拦下的工具调用", (m) => m.permissionDenials],
];

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
        const s = summarize(some.map(of));
        return [name, { median: round(s.median), min: round(s.min), max: round(s.max), n: s.n }];
      }),
    );
  const agents = [...new Set(measures.map((m) => m.agent))];
  const summary = agents.map((agent) => {
    const mine = measures.filter((m) => m.agent === agent);
    return {
      agent,
      versions: [...new Set(mine.map((m) => m.version))],
      models: [...new Set(mine.map((m) => m.model))],
      runs: mine.length,
      dates: [...new Set(mine.map((m) => m.date.slice(0, 10)))],
      overall: sum(mine),
      scenarios: Object.fromEntries([...new Set(mine.map((m) => m.scenario))].map((scenario) => [scenario, sum(mine.filter((m) => m.scenario === scenario))])),
      brokenTests: mine.filter((m) => m.shownBefore.length).map((m) => `${m.scenario} #${m.run}: ${m.shownBefore.join(", ")}`),
    };
  });
  writeFileSync(join(out, "measures.json"), `${JSON.stringify(measures, null, 2)}\n`);
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const cell = (s: { median: number | null; min: number | null; max: number | null }) => (s.median === null ? "–" : `${s.median}（${s.min}–${s.max}）`);
  const md = summary
    .map((agent) =>
      [
        `## ${agent.agent}：${agent.versions.join(", ")}，模型 ${agent.models.join(", ")}，${agent.runs} 次，${agent.dates.join(", ")}`,
        "",
        "| 指标 | 中位数（范围） | 次数 |",
        "|---|---|---|",
        ...METRICS.map(([name]) => `| ${name} | ${cell(agent.overall[name])} | ${agent.overall[name].n} |`),
        "",
        `| 场景 | ${METRICS.slice(0, 2).concat(METRICS.slice(3, 4), METRICS.slice(8, 9), METRICS.slice(15, 16)).map(([name]) => name).join(" | ")} |`,
        `|---|${"---|".repeat(5)}`,
        ...Object.entries(agent.scenarios).map(
          ([scenario, s]) => `| ${scenario} | ${[METRICS[0], METRICS[1], METRICS[3], METRICS[8], METRICS[15]].map(([name]) => cell(s[name])).join(" | ")} |`,
        ),
        ...(agent.brokenTests.length ? ["", `场景的预期在 Agent 开始前就成立（测试有误）：${agent.brokenTests.join("; ")}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
  writeFileSync(join(out, "summary.md"), `${md}\n`);
  console.log(`\n${md}\n\nRaw results and measures: ${out}`);
}

await main(process.argv.slice(2));
