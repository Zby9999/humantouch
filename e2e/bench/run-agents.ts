/**
 * The applying bench, with real Agents: each standard scenario is designed in
 * the editor layer of a fresh copy of the example, an Agent applies it
 * unattended, and the run is measured from what it left behind. Pages open in
 * Playwright's headless shell only: nothing takes the designer's focus.
 *
 *   pnpm bench:agents [--agents claude,pi] [--scenarios id,…] [--runs 3] [--max-runs n]
 *                     [--out <dir> --first-run n]   add runs n onward to the raw results in <dir>, as more of the same round of runs
 *                     [--no-skill]   a project with no Skill, the Agent told only to run `claim` and apply as it says (ticket 65);
 *                                    scenarios with an ask of their own (`prompt`, an undo) are left out then, having no round to claim
 *   pnpm bench:agents --dry           set the scenarios up, run no Agent: each must make its changes, none shown yet
 *                     [--claim-out <dir>]   and write what `claim` prints for each to <dir>/<scenario>.md, to compare two versions word for word
 *   pnpm bench:agents --scripted [--scenarios id,…]
 *                                     set each scenario with scripted code (`apply`, all of them by default) up as `--dry` does, then play an
 *                                     Agent applying it right, with no Agent run: claim, write that code, wait for the page to show it, `done`
 *                                     for the changes it applies, `finish`, and fill in the report `finish` lays out. Each change must show by
 *                                     the scenario's own test at its widths (a change with no test fails, a brief aside), and get the page's
 *                                     check of it as shown; one with a Variable must write it (as `usesVariable` counts it); one `notOneToOne`
 *                                     must be in the report under ⚠️ alone, with why and instead (`checkReport`). The scenario's own
 *                                     expectations must hold. With no changes (an undo), only `apply` runs: no claim, no finish, no report.
 *                                     With `--dry` or `--scripted`, BENCH_DEBUG=1 prints a scenario's error whole, not its first line only.
 *   pnpm bench:agents summary <dir>   measure the raw results in <dir> again, and sum them up
 *
 * A scenario with an ask of its own (`prompt`) tells the Agent that, in the designer's words, instead of `PROMPT`; its own expectations
 * (`expectations`: the page, and the source as at the round's start) are measured as 场景整体预期成立. With no changes to apply (an undo), what
 * is measured by the round, the report or per change is null, not 0.
 *
 * Each scenario runs on its own example project (`example`), each set up once
 * for the whole bench. Dev servers take ports from 5620 on, or from
 * `TK_BENCH_PORT` (30 of them), so two checkouts running the bench at once
 * keep apart.
 *
 * Runs go one after another, never side by side, so their times compare,
 * run 1 of every scenario first; `--max-runs` stops after that many Agent
 * runs, and a run on another model than the Agent's pinned one stops them all. Raw
 * results go to `bench-results/agents/<when>/`, which git ignores.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sh } from "../tests/install-copy.ts";
import { agentVersion, AGENTS, BENCH_FILES, commandLine, NO_SKILL_PROMPT, PROMPT, runAgent, type AgentRun } from "./agents.ts";
import { checkReport, fffProblem, measureRun, parseTranscript, pooled, reportedAsExpected, scenarioExpectationsHold, summarize, toolCallStats, keepsVariable, usesVariable, variableParts, type AgentName, type VariableNames } from "./metrics.ts";
import { canvasUpdatedNoticesShown, pageChangedNoticesShown, recordNotices, stalledNoticesShown, unclaimedNoticesShown } from "./notices.ts";
import { shellDenied } from "./pi-extension.ts";
import { cloneBase, prepareBase, startDevServer, type RunProject } from "./project.ts";
import { designProblems, exampleOf, held, openObservers, shown, type Desk, type Example, type SavedChange, type Scenario } from "./scenarios.ts";
import { STANDARD_SCENARIOS } from "./scenarios-other-examples.ts";
import { showLayersOnEntry } from "../layers-on-entry.ts";

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
/** The bench's dev servers take ports from here, one run after another: apart from e2e's and the performance tests'. Another checkout's bench sets `TK_BENCH_PORT` apart. */
const FIRST_PORT = Number(process.env.TK_BENCH_PORT ?? 5620);
const PORTS = 30;
/** Longest an Agent gets for a round. */
const AGENT_TIMEOUT_MS = 20 * 60_000;
/** How often the page is looked at for a change newly shown, and the round's files for a claim, a `done`, a finish. */
const SHOWN_POLL_MS = 1000;
const FILES_POLL_MS = 250;
/** Longest the bench waits for the page to show the code written, and its end state, as an Agent or the scripted pass leaves it: the dev server bringing an edit in (Next.js slowly). */
const END_STATE_MS = 30_000;

/** What a run leaves for measuring, besides the transcript, the diff and the Agent's other output. */
interface RawRun {
  agent: AgentName;
  scenario: string;
  run: number;
  date: string;
  version: string;
  commandLine: string;
  /** False for a run in a project with no Skill (`--no-skill`); missing in runs before ticket 65, which all had it. */
  skill?: boolean;
  /** The extensions of others the Agent ran with, by name, and the version installed (pi's pi-fff); missing for an Agent with none, and in runs before ticket 92. */
  extensions?: Record<string, string | null>;
  /** pi's: fingerprints of the designer's settings.json and models.json, which apply to its runs (`sha256:<hex>`, null for one absent); recorded, never scored. Missing in runs before ticket 88. */
  piConfig?: Record<string, string | null>;
  /** The effort the command line sets, and the one the session ran at, as Claude Code's debug log or pi's transcript shows it. */
  effort: { set: string; seen: string | null };
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  endedAt: number;
  /** Cursor's: the headless shell its browser plugins were given, or null (then Chrome, headless). */
  headlessShell?: string | null;
  /** Browsers that came up under the Agent with a window. */
  headedBrowsers: string[];
  changes: { id: number; kind: string; checkable: boolean; variable?: VariableNames; variableKept?: VariableNames; notOneToOne?: true; shownBefore: boolean | null; shownAtEnd: boolean | null }[];
  /** The scenario's own expectations (ticket 86): whether each held before the Agent started and at the end, and whether it is to hold before too. Missing in runs before. */
  scenarioExpectations?: { kept: boolean; before: boolean; atEnd: boolean }[];
  /**
   * How many times, from the Agent's start on, the designer's page showed the
   * notice that the code is changing but no Agent has claimed the changes
   * (ticket 66). Recorded only, never scored: before the claim it is the Agent
   * editing unclaimed, after it a false one. Missing in runs before ticket 66;
   * 0 from ticket 78 on, which took the notice away (the page claims the round
   * for an Agent applying it unclaimed).
   */
  unclaimedNotices?: number;
  /**
   * How many times, from the Agent's start on, the designer's toggle said the
   * Agent seems to have stopped (ticket 67): with the Agent at work all along,
   * each is a false one. Missing in runs before ticket 67.
   */
  stalledNotices?: number;
  /**
   * How long, from the Agent's end, the page took to show each change applied
   * and hold the scenario's own expectations (`endState`), up to
   * `END_STATE_MS`: a long one is the dev server slow to bring the last edit
   * in, or something not shown at all. Recorded only, never scored. Missing in
   * runs before ticket 88, which waited 3 s and looked once.
   */
  endWaitMs?: number;
  /**
   * Whether the page loaded afresh for the end's last look: false when no
   * reload did up to `END_STATE_MS` (the dev server gone, or the page left
   * broken), so nothing shows or holds at the end, whoever broke it. Missing
   * in runs before ticket 88, where a reload failing at the end stopped the run.
   */
  endLoaded?: boolean;
  /** In ms since the epoch: the claim, each `done`, the finish, each change newly shown on the page, each edit to the project's source, and each time either notice showed. */
  times: { claim: number | null; dones: number[]; finish: number | null; shown: { id: number; at: number }[]; edits: number[]; unclaimedNotices?: number[]; stalledNotices?: number[] };
  /** The page's last check of each change, as the round was archived (or left, unfinished). */
  checks: Record<string, { outcome: string }>;
}

async function main(argv: string[]) {
  if (argv[0] === "summary") return writeSummary(argv[1]);
  const option = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const agents = (option("agents") ?? "claude,pi").split(",") as AgentName[];
  const scripted = argv.includes("--scripted");
  // The scripted pass takes the scenarios with scripted code, unless named.
  const scenarios = (
    option("scenarios") ? STANDARD_SCENARIOS.filter((scenario) => option("scenarios")!.split(",").includes(scenario.id)) : STANDARD_SCENARIOS.filter((scenario) => !scripted || scenario.apply)
  ).filter((scenario) => !(argv.includes("--no-skill") && scenario.prompt));
  const runs = Number(option("runs") ?? 3);
  const firstRun = Number(option("first-run") ?? 1);
  const maxRuns = Number(option("max-runs") ?? Infinity);
  const dry = argv.includes("--dry");
  const claimOut = option("claim-out");
  const skill = !argv.includes("--no-skill");
  const prompt = skill ? PROMPT : NO_SKILL_PROMPT;
  for (const agent of agents) if (!AGENTS[agent]) throw new Error(`No Agent ${agent}: ${Object.keys(AGENTS).join(", ")}`);

  // Absolute: the Agent runs in the project, and finds its own files in the run folder by this path.
  const out = resolve(option("out") ?? join(RESULTS, new Date().toISOString().replace(/[:.]/g, "-")));
  const plan = dry || scripted ? scenarios.length : Math.min(maxRuns, agents.length * scenarios.length * runs);
  if (scripted) console.log(`Applying ${plan} scenarios by their scripted code, with no Agent.`);
  else console.log(dry ? `Setting up ${plan} scenarios, with no Agent.` : `${plan} Agent runs: ${agents.join(", ")} × ${scenarios.length} scenarios × ${runs}${skill ? "" : ", with no Skill"}. Raw results in ${out}`);

  const versions: Partial<Record<AgentName, string>> = {};
  if (!dry && !scripted) {
    for (const agent of agents) versions[agent] = await agentVersion(agent);
    mkdirSync(out, { recursive: true });
    const each = <T,>(of: (agent: AgentName) => T) => Object.fromEntries(agents.map((agent) => [agent, of(agent)]));
    // A scenario with an ask of its own runs by the command line with that ask: its own, by scenario.
    const prompts = Object.fromEntries(scenarios.filter((scenario) => scenario.prompt).map((scenario) => [scenario.id, scenario.prompt!]));
    const extensions = each((agent) => AGENTS[agent].extensions?.() ?? {});
    const meta = { versions, models: each((agent) => AGENTS[agent].model), efforts: each((agent) => AGENTS[agent].effort), commandLines: each((agent) => commandLine(agent, prompt)), skill: each(() => skill), extensions, prompts };
    // Runs added to a round of runs compare with it only on the same Agent, command line and extensions, and the same ask of a scenario's own.
    const before = existsSync(join(out, "meta.json")) ? JSON.parse(readFileSync(join(out, "meta.json"), "utf8")) : null;
    for (const agent of agents) {
      const extensionsDiffer = JSON.stringify(before?.extensions?.[agent] ?? {}) !== JSON.stringify(extensions[agent]);
      if (before?.commandLines?.[agent] && (before.commandLines[agent] !== meta.commandLines[agent] || before.versions[agent] !== versions[agent] || extensionsDiffer)) {
        throw new Error(`${out} has ${agent} runs by another command line, version or extension: start a round of runs of their own`);
      }
    }
    for (const [scenario, ask] of Object.entries(prompts)) {
      if (before?.prompts?.[scenario] !== undefined && before.prompts[scenario] !== ask) throw new Error(`${out} has ${scenario} runs by another ask: start a round of runs of their own`);
    }
    const merged = before ? Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, { ...before[key], ...value }])) : meta;
    writeFileSync(join(out, "meta.json"), `${JSON.stringify(merged, null, 2)}\n`);
  }

  // One base for each example the scenarios run on, set up as the first of them comes.
  const bases = new Map<Example, Promise<Awaited<ReturnType<typeof prepareBase>>>>();
  const baseFor = async (scenario: Scenario) => {
    const example = exampleOf(scenario);
    if (!bases.has(example)) bases.set(example, prepareBase({ skill, example }));
    return (await bases.get(example)!).base;
  };
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
    if (scripted) {
      for (const scenario of scenarios) {
        const problems = await applyScripted(browser, await baseFor(scenario), await nextPort(), scenario);
        console.log(`${problems.length ? "✗" : "✓"} ${scenario.id}${problems.map((problem) => `\n    ${problem}`).join("")}`);
        failures.push(...problems);
      }
    } else if (dry) {
      for (const scenario of scenarios) {
        const problems = await setUp(browser, await baseFor(scenario), await nextPort(), scenario, claimOut && join(claimOut, `${scenario.id}.md`));
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
              await runOnce({ browser, base: await baseFor(scenario), port: await nextPort(), scenario, agent, run, version: versions[agent]!, folder, skill });
              agentRuns++;
              const measures = measureFolder(folder);
              console.log(`${agent} ${scenario.id} #${run}: ${Math.round((Date.now() - started) / 1000)}s, ${oneLine(measures)}`);
              if (measures.model !== AGENTS[agent].model) stop = `${agent} ran on ${measures.model}, not ${AGENTS[agent].model}: stopped`;
              else if (measures.fffProblem) stop = `${agent} ${measures.fffProblem}: stopped`;
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
    for (const base of bases.values()) await base.then((prepared) => prepared.remove()).catch(() => {});
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
  work: (round: { project: RunProject; saved: SavedChange[]; observers: Map<number, Page>; designer: Page; desk: Desk }) => Promise<T>,
): Promise<T> {
  const project = await cloneBase(base);
  let server: Awaited<ReturnType<typeof startDevServer>> | null = null;
  let context: BrowserContext | null = null;
  let observers: Awaited<ReturnType<typeof openObservers>> | null = null;
  try {
    server = await startDevServer(project.dir, port, exampleOf(scenario));
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    // The Layers panel starts hidden on every entry (designer, 2026-11-08): shown as the e2e tests show it, before the canvas is first laid out.
    await showLayersOnEntry(context);
    await recordNotices(context);
    const page = await context.newPage();
    await page.goto(server.url);
    await page.locator("main").waitFor();
    observers = await openObservers(browser, scenario, server.url);
    // A command line held to the rule pi's are (the bench's extension), before it runs: a command the Skill gives that the bench turns away is a gap the scripted pass finds.
    const shell = (command: string) => {
      const denied = shellDenied(command, project.dir);
      if (denied !== null) throw new Error(`the bench turns away a command line the scenario runs as an Agent would: ${denied}`);
      return sh("/bin/sh", ["-c", command], project.dir);
    };
    const desk: Desk = { page, cli: project.cli, edit: project.edit, settle: project.settle, changeSet: project.changeSet, shell };
    await scenario.design(desk);
    // An undo has no round to apply: no ChangeSet.
    return await work({ project, saved: project.changeSet()?.changes ?? [], observers: observers.pages, designer: page, desk });
  } finally {
    try {
      await observers?.close().catch(() => {});
      await context?.close().catch(() => {});
      // Stopped, and gone: else its service may write into the project as it is being removed (`.humantouch/checks.json.<pid>.tmp`).
      await server?.stop();
    } finally {
      project.remove();
    }
  }
}

/**
 * Sets a scenario up with no Agent; what is wrong with it: changes not as it
 * names them, or shown on the page already. `claimTo`: then claims the round,
 * and writes what `claim` prints there.
 */
async function setUp(browser: Browser, base: string, port: number, scenario: Scenario, claimTo?: string): Promise<string[]> {
  try {
    return await withScenario(browser, base, port, scenario, async ({ project, saved, observers, designer }) => {
      const problems = await setUpProblems(scenario, saved, observers, designer, project);
      if (claimTo) {
        mkdirSync(join(claimTo, ".."), { recursive: true });
        writeFileSync(claimTo, await project.cli("claim"));
      }
      return problems;
    });
  } catch (error) {
    return [problemOf(error)];
  }
}

/**
 * Whether each of the scenario's own expectations (`expectations`) holds now: the page's
 * test at its widths, and the project's source as at `head` (the commit the
 * round starts from), each where the check has it.
 */
async function expectationsHold(observers: Map<number, Page>, scenario: Scenario, dir: string, head: string): Promise<boolean[]> {
  const onPage = await held(observers, scenario);
  const source = scenario.expectations?.some((expectation) => expectation.sourceAsAtStart) ? await sourceAsAt(dir, head) : true;
  return (scenario.expectations ?? []).map((expectation, i) => onPage[i] !== false && (!expectation.sourceAsAtStart || source));
}

/**
 * Whether the source in `dir` is as at commit `head`: no file changed, gone or
 * new. Not the source: `.humantouch/`, and what the bench itself puts in the
 * project for an Agent (`BENCH_FILES`: Cursor's permissions in `.cursor/`, and
 * whatever another Agent's `prepare` names). Stages nothing, so the Agent sees
 * the project as it left it.
 */
async function sourceAsAt(dir: string, head: string): Promise<boolean> {
  const outside = ["--", ".", ":(exclude).humantouch", ...BENCH_FILES.map((path) => `:(exclude)${path}`)];
  const changed = await sh("git", ["diff", "--name-only", head, ...outside], dir);
  const added = await sh("git", ["ls-files", "--others", "--exclude-standard", ...outside], dir);
  return !changed.trim() && !added.trim();
}

/** What is wrong with the scenario's own expectations before the Agent starts: one that holds and is not to, or one kept that does not. */
function expectationsBefore(scenario: Scenario, before: boolean[]): string[] {
  return (scenario.expectations ?? []).flatMap((expectation, i) => (before[i] === !!expectation.kept ? [] : [`expectation ${i + 1} ${before[i] ? "holds" : "does not hold"} before the Agent starts: ${expectation.expect}`]));
}

/**
 * What is wrong with a scenario just set up: a notice of the code changing;
 * the round not as the scenario designs it (`designProblems`: its changes'
 * kinds, what the page can check, the Variables named); a change shown on the
 * page already; one of its own expectations not as it is to be before the
 * Agent starts.
 */
async function setUpProblems(scenario: Scenario, saved: SavedChange[], observers: Map<number, Page>, designer: Page, project: RunProject): Promise<string[]> {
  const problems: string[] = [];
  // Designing touches no code with no claim: the editor layer has nothing to tell of the code changing.
  const notices = (await unclaimedNoticesShown(designer)).length + (await canvasUpdatedNoticesShown(designer)).length + (await pageChangedNoticesShown(designer)).length;
  if (notices) problems.push(`a notice of the code changing showed ${notices} times as it was set up`);
  problems.push(...designProblems(scenario, saved));
  (await shown(observers, scenario, saved)).forEach((shows, i) => shows && problems.push(`change ${i + 1} shows before it is applied`));
  problems.push(...expectationsBefore(scenario, await expectationsHold(observers, scenario, project.dir, await project.head())));
  return problems;
}

/** A scenario that could not be set up or applied, as its error's first line; whole too, with BENCH_DEBUG=1. */
function problemOf(error: unknown): string {
  if (process.env.BENCH_DEBUG) console.error(error);
  return (error as Error).message.split("\n")[0];
}

/**
 * The scripted pass of a scenario (tickets 86, 87): set up as `--dry` does,
 * then applied by its scripted code (`apply`), as an Agent applying it right
 * would, with no Agent run: claim, the code, `done` for the changes it
 * applies once the page shows them, `finish`, and the report filled in. What
 * is wrong: what `--dry` finds; a command line it runs (`desk.shell`) that
 * the bench would turn away for an Agent, by pi's rule; a change applied that its own test does not
 * show at its widths, or that has no test (a brief aside); a change the page
 * can check whose check, as the round was archived, is not "shown"; a
 * Variable named not written; a report, as `finish` lays it out and an Agent
 * fills it in, with a change under ⚠️ other than those `notOneToOne`, or one
 * of them not there; one of the scenario's own expectations not holding.
 */
async function applyScripted(browser: Browser, base: string, port: number, scenario: Scenario): Promise<string[]> {
  if (!scenario.apply) return ["no scripted code (`apply`)"];
  try {
    return await withScenario(browser, base, port, scenario, async ({ project, saved, observers, designer, desk }) => {
      const problems = await setUpProblems(scenario, saved, observers, designer, project);
      if (problems.length) return problems;
      const head = await project.head();
      const history = join(project.dir, ".humantouch/history");
      const rounds = () => (existsSync(history) ? readdirSync(history).sort() : []);
      const roundsBefore = rounds().length;

      // A round to apply: claimed, applied, done and finished. An undo (no changes): only what `apply` does, as the Skill says.
      const applying = scenario.changes.length > 0;
      if (applying) await project.cli("claim");
      await scenario.apply!(desk);
      const applied = saved.filter((_, i) => !scenario.changes[i].notOneToOne).map((change) => change.id);
      // The dev server brings the code in (Next.js slowly): then `done`, as an Agent runs it once the page has the change.
      if (applied.length) {
        await endState(observers, scenario, saved, project.dir, head, false);
        await project.cli("done", ...applied.map(String));
      }
      const report = applying ? fillInReport(await project.cli("finish"), scenario, saved) : null;

      // The end, once the dev server has brought the last edit in: an undo has no `done` or `finish` to wait for it by.
      const { atEnd, expectations, loaded } = await endState(observers, scenario, saved, project.dir, head, true);
      if (!loaded) problems.push(`the page did not load afresh at the end, in ${END_STATE_MS / 1000} s`);
      expectations.forEach((holds, i) => holds || problems.push(`expectation ${i + 1} does not hold: ${scenario.expectations![i].expect}`));
      const checks: Record<string, { outcome: string }> = rounds().length > roundsBefore ? JSON.parse(readFileSync(join(history, rounds().at(-1)!, "result.json"), "utf8")).checks : {};
      await sh("git", ["add", "-A"], project.dir);
      const diff = await sh("git", ["diff", "--cached", head], project.dir);
      scenario.changes.forEach((change, i) => {
        if (change.notOneToOne) return;
        const id = saved[i].id;
        if (atEnd[i] === false) problems.push(`change ${i + 1} does not show: ${change.expect}`);
        if (atEnd[i] === null && change.kind !== "brief") problems.push(`change ${i + 1} has no test of its own (\`shows\`) to show it by`);
        if (change.checkable && checks[id]?.outcome !== "shown") problems.push(`change ${i + 1}: the page's check says ${checks[id]?.outcome ?? "nothing"}`);
        if (change.variable && !usesVariable(diff, change.variable)) problems.push(`change ${i + 1}: the code does not write ${variableParts(change.variable).map((names) => names.join(" or ")).join(", and ")}`);
        if (change.variableKept && !keepsVariable(diff, change.variableKept)) problems.push(`change ${i + 1}: the code does not keep ${variableParts(change.variableKept).map((names) => names.join(" or ")).join(", and ")}`);
      });
      if (!report) return problems;
      const check = checkReport(report, saved.map((change) => change.id));
      if (!check.compliant) problems.push(`the report: ${check.problems.join("; ")}`);
      const warned = saved.filter((_, i) => scenario.changes[i].notOneToOne).map((change) => change.id);
      if (check.notApplied.join() !== warned.join()) problems.push(`the report has ${check.notApplied.join(", ") || "none"} under ⚠️, not ${warned.join(", ") || "none"}`);
      if (reportedAsExpected(check, warned.map((id) => ({ id, shown: atEnd[saved.findIndex((change) => change.id === id)] }))) !== (warned.length ? 1 : null)) problems.push("the report has the changes that cannot be applied 1:1 elsewhere than under ⚠️ alone, with why and instead");
      return problems;
    });
  } catch (error) {
    return [problemOf(error)];
  }
}

/**
 * The page looked at afresh until each change applied shows, and with
 * `withExpectations` each of the scenario's own expectations holds, or for
 * `END_STATE_MS`: the dev server brings an edit in a while after it is
 * made (Next.js compiling it, slowly on a busy machine). With how long it
 * waited (all of `END_STATE_MS` when something does not show or hold), and
 * whether the last look was at pages loaded afresh.
 */
async function endState(observers: Map<number, Page>, scenario: Scenario, saved: SavedChange[], dir: string, head: string, withExpectations: boolean) {
  const from = Date.now();
  const until = from + END_STATE_MS;
  for (;;) {
    // A reload can fail as the dev server brings an edit in (Next.js recompiling): looked at again, till the time is up.
    // Each page done reloading, failed or not, before any is looked at: no look at a page still loading, no reload over one.
    const reloads = await Promise.allSettled([...observers.values()].map((page) => page.reload().then(() => page.locator("main").waitFor())));
    const loaded = reloads.every((reload) => reload.status === "fulfilled");
    const atEnd = await shown(observers, scenario, saved);
    const expectations = withExpectations ? await expectationsHold(observers, scenario, dir, head) : [];
    const holds = scenario.changes.every((change, i) => change.notOneToOne || atEnd[i] !== false) && expectations.every(Boolean);
    if ((loaded && holds) || Date.now() > until) return { atEnd, expectations, waitedMs: Date.now() - from, loaded };
    await new Promise((resolve) => setTimeout(resolve, SHOWN_POLL_MS));
  }
}

/**
 * The report `finish` lays out (its fenced block), filled in as an Agent
 * applying the round right would: under ⚠️, why a change cannot be applied
 * 1:1 (`notOneToOne`) and that it was left as it was. Each line of a change
 * is to have its placeholder (`REPORT_PLACEHOLDERS`), and none is to be left:
 * when `finish` lays the report out otherwise, the scenario fails, saying
 * where, not a report half filled in checked as the Agent's.
 */
function fillInReport(finished: string, scenario: Scenario, saved: SavedChange[]): string {
  const block = /```\n([\s\S]*?)\n```/.exec(finished);
  if (!block) throw new Error(`\`finish\` lays out no report (a fenced block) to fill in:\n${finished}`);
  let change: number | null = null;
  const filled = block[1].split("\n").map((line) => {
    const item = /^\s*-\s*(\d+)\./.exec(line);
    if (item) change = Number(item[1]);
    const kind = item ? "item" : /^\s+Why:/.test(line) ? "why" : /^\s+Instead:/.test(line) ? "instead" : null;
    if (kind && !REPORT_PLACEHOLDERS[kind].some(([placeholder]) => line.includes(placeholder))) {
      throw new Error(`The report \`finish\` lays out has none of ${REPORT_PLACEHOLDERS[kind].map(([placeholder]) => placeholder).join(", ")} to fill in on: ${line}`);
    }
    const reason = scenario.changes[saved.findIndex((c) => c.id === change)]?.notOneToOne ?? "unknown";
    return Object.values(REPORT_PLACEHOLDERS)
      .flat()
      .reduce((text, [placeholder, value]) => text.replace(placeholder, value === WHY ? reason : value), line);
  });
  // A placeholder is words in angle brackets (`<the layer>`), not a tag of a change's title (`<button>`).
  const left = filled.find((line) => /<[^<>\s]+\s[^<>]*>/.test(line));
  if (left !== undefined) throw new Error(`The report \`finish\` lays out has a placeholder the scripted pass does not fill in: ${left}`);
  return filled.join("\n");
}

/** Stands for the change's own reason, `notOneToOne`, among the values the scripted pass fills a report in with. */
const WHY = Symbol("why");

/**
 * The placeholders of the report `finish` lays out (report-form.ts), by the
 * line of a change they are on, one of them on each: the change's line,
 * under ✓ or ⚠️; its Why; its Instead. Each with what the scripted pass puts
 * in its place.
 */
const REPORT_PLACEHOLDERS: Record<"item" | "why" | "instead", [string, string | typeof WHY][]> = {
  item: [
    ["<the layer, and what you changed>", "as asked"],
    ["<the layer>", "the layer"],
  ],
  why: [
    ["<why it is not applied>", WHY],
    ["<what keeps it so>", "unknown"],
  ],
  instead: [["<what you did, or “left as it was”>", "left as it was"]],
};

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
async function runOnce({
  browser,
  base,
  port,
  scenario,
  agent,
  run,
  version,
  folder,
  skill,
}: {
  browser: Browser;
  base: string;
  port: number;
  scenario: Scenario;
  agent: AgentName;
  run: number;
  version: string;
  folder: string;
  skill: boolean;
}) {
  const prompt = skill ? (scenario.prompt ?? PROMPT) : NO_SKILL_PROMPT;
  await withScenario(browser, base, port, scenario, async ({ project, saved, observers, designer }) => {
    const head = await project.head();
    writeFileSync(join(folder, "changeset.json"), `${JSON.stringify({ changes: saved }, null, 2)}\n`);
    const before = await shown(observers, scenario, saved);
    const expectationsBeforeAgent = await expectationsHold(observers, scenario, project.dir, head);

    // While the Agent works: the claim, each done and the finish from the round's files; each source edit; each change newly shown on the page.
    const times: RawRun["times"] = { claim: null, dones: [], finish: null, shown: [], edits: [] };
    const humanTouch = join(project.dir, ".humantouch");
    const readJson = (file: string) => {
      try {
        return JSON.parse(readFileSync(join(humanTouch, file), "utf8"));
      } catch {
        return null; // Not there, or being written.
      }
    };
    const rounds = () => (existsSync(join(humanTouch, "history")) ? readdirSync(join(humanTouch, "history")).sort() : []);
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
    // As the run starts: pi may write its settings.json as it goes.
    const piConfig = AGENTS[agent].configFingerprints?.();
    let agentRun: AgentRun;
    try {
      agentRun = await runAgent(agent, project.dir, folder, AGENT_TIMEOUT_MS, prompt);
    } finally {
      clearInterval(fileTimer);
      clearInterval(pageTimer);
      await looking;
    }
    watchFiles();
    times.unclaimedNotices = await unclaimedNoticesShown(designer, agentRun.startedAt);
    times.stalledNotices = await stalledNoticesShown(designer, agentRun.startedAt);

    // The end, as the scripted pass measures it: the page loaded afresh till the dev server has brought the last edits in (Next.js
    // slowly), so a change written right is not measured as not shown. A change not shown, or an expectation not holding, waits it all out.
    const { atEnd, expectations: expectationsAtEnd, waitedMs: endWaitMs, loaded: endLoaded } = await endState(observers, scenario, saved, project.dir, head, true);
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
      commandLine: commandLine(agent, prompt),
      skill,
      ...(AGENTS[agent].extensions && { extensions: AGENTS[agent].extensions() }),
      ...(piConfig && { piConfig }),
      effort: { set: AGENTS[agent].effort, seen: AGENTS[agent].effortSeen?.(folder) ?? null },
      ...agentRun,
      unclaimedNotices: times.unclaimedNotices.length,
      stalledNotices: times.stalledNotices.length,
      endWaitMs,
      endLoaded,
      changes: scenario.changes.map((change, i) => ({
        id: saved[i].id,
        kind: change.kind,
        checkable: change.checkable,
        ...(change.variable && { variable: change.variable }),
        ...(change.variableKept && { variableKept: change.variableKept }),
        ...(change.notOneToOne && { notOneToOne: true as const }),
        shownBefore: before[i],
        shownAtEnd: atEnd[i],
      })),
      ...(scenario.expectations && { scenarioExpectations: scenario.expectations.map((expectation, i) => ({ kept: !!expectation.kept, before: expectationsBeforeAgent[i], atEnd: expectationsAtEnd[i] })) }),
      times,
      checks: Object.fromEntries(Object.entries(checks).map(([id, check]) => [id, { outcome: (check as { outcome: string }).outcome }])),
    };
    writeFileSync(join(folder, "raw.json"), `${JSON.stringify(raw, null, 2)}\n`);
    if (!endLoaded) console.error(`Bench: the page did not load afresh at the end of ${folder}: nothing shows or holds there, see endLoaded in raw.json`);
    if (raw.headedBrowsers.length > 0) console.error(`Bench: ${agent} opened a browser with a window in ${folder}: see headedBrowsers in raw.json`);
  });
}

/** A run's measures, from its folder: the numbers the bench compares. */
export function measureFolder(folder: string) {
  const saved: RawRun = JSON.parse(readFileSync(join(folder, "raw.json"), "utf8"));
  // What the page can check, and the Variables, as the scenario has them now: a rule fixed since is measured by.
  const scenario = STANDARD_SCENARIOS.find((s) => s.id === saved.scenario);
  const raw: RawRun = {
    ...saved,
    changes: saved.changes.map((change, i) => {
      const now = scenario?.changes[i];
      return now?.kind === change.kind ? { ...change, checkable: now.checkable, variable: now.variable, variableKept: now.variableKept, notOneToOne: now.notOneToOne ? (true as const) : undefined } : change;
    }),
  };
  /** A change of the run, for a list of misses: its id, its kind, and what the page is to show, as the scenario has it now (none when it has changed since). */
  const missed = (change: RawRun["changes"][number], i: number) => ({ id: change.id, kind: change.kind, expect: scenario?.changes[i]?.kind === change.kind ? scenario.changes[i].expect : null });
  const transcript = parseTranscript(raw.agent, readFileSync(join(folder, "transcript.jsonl"), "utf8"));
  const stats = toolCallStats(transcript.toolCalls);
  const ids = raw.changes.map((change) => change.id);
  const report = checkReport(transcript.finalText, ids);
  const count = raw.changes.length;
  const diff = readFileSync(join(folder, "diff.patch"), "utf8");
  // A Variable the code writes already and is to keep (`variableKept`) counts as one too: kept, it is used.
  const withVariable = raw.changes.filter((change) => change.variable || change.variableKept);
  const usedVariable = withVariable.filter((change) => (change.variable ? usesVariable(diff, change.variable) : keepsVariable(diff, change.variableKept!)));
  // A scenario with no changes to apply (an undo) has no round: what is measured by the round, the report or per change is null.
  const applying = count > 0;
  const round =
    raw.times.claim === null || !applying
      ? null
      : measureRun({
          changes: raw.changes.map((change) => ({ id: change.id, checkable: change.checkable, shown: change.shownAtEnd, notOneToOne: change.notOneToOne })),
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
    skill: raw.skill ?? true,
    model: transcript.model,
    responseModels: transcript.responseModels,
    skills: transcript.skills,
    tools: transcript.tools,
    extensions: raw.extensions ?? {},
    /** A run with pi-fff whose transcript does not show fff's tools as such (ticket 92): the bench stops on it. */
    fffProblem: fffProblem(raw.extensions, transcript),
    changes: count,
    exitCode: raw.exitCode,
    timedOut: raw.timedOut,
    agentMs: raw.endedAt - raw.startedAt,
    claimed: applying ? raw.times.claim !== null : null,
    ranDone: applying ? stats.dones > 0 : null,
    ranFinish: applying ? raw.times.finish !== null : null,
    dones: stats.dones,
    toolCalls: stats.toolCalls,
    toolCallsPerChange: applying ? stats.toolCalls / count : null,
    repoWideSearches: stats.repoWideSearches,
    packageReads: stats.packageReads,
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
    /** The two 1:1 rates' parts and wholes, summed up over runs (`pooled`); null with no round. Measured from raw.json, so runs from before it was recorded have it too. */
    oneToOneCounts: round?.oneToOneCounts ?? null,
    falseChecks: round?.falseChecks ?? [],
    maxProgressGapMs: round?.maxProgressGapMs ?? null,
    maxStillMs: round?.maxStillMs ?? null,
    /** The editor layer's notices on the designer's page from the Agent's start (tickets 66, 67): how many, and when, in ms from the Agent's start; null in runs before. */
    unclaimedNotices: raw.unclaimedNotices ?? null,
    unclaimedNoticesAtMs: raw.times.unclaimedNotices?.map((at) => at - raw.startedAt) ?? null,
    stalledNotices: raw.stalledNotices ?? null,
    stalledNoticesAtMs: raw.times.stalledNotices?.map((at) => at - raw.startedAt) ?? null,
    reportCompliant: applying ? report.compliant : null,
    reportProblems: applying ? report.problems : null,
    /** The changes with a Variable, and how many of them the diff writes it for: summed up over runs, not run by run (`pooled`). Measured from the diff, so runs from before it was recorded have it too. */
    variables: { part: usedVariable.length, whole: withVariable.length },
    variableUse: withVariable.length ? usedVariable.length / withVariable.length : null,
    /**
     * Of the changes that cannot be applied 1:1 (ticket 86), the share the
     * report gives right, "落地不了 1:1 的改动报得对": under ⚠️ with why and
     * instead, or under ✓ with the page showing it (an Agent that found a way
     * after all); null with none.
     */
    reportedAsExpected: reportedAsExpected(
      report,
      raw.changes.filter((change) => change.notOneToOne).map((change) => ({ id: change.id, shown: change.shownAtEnd })),
    ),
    /** The changes that can be applied 1:1 the page does not show at the end, by their scenario test (88 lists the misses by kind of change from these). */
    notShown: raw.changes.flatMap((change, i) => (!change.notOneToOne && change.shownAtEnd === false ? [missed(change, i)] : [])),
    /** The changes that cannot be applied 1:1 the report does not give right (`reportedAsExpected`); none with no round. */
    reportedWrong: applying
      ? raw.changes.flatMap((change, i) => (change.notOneToOne && reportedAsExpected(report, [{ id: change.id, shown: change.shownAtEnd }]) === 0 ? [missed(change, i)] : []))
      : [],
    /** The scenario's own expectations that do not hold at the end, by number from 1. */
    expectationsNotHeld: (raw.scenarioExpectations ?? []).flatMap((expectation, i) =>
      expectation.atEnd ? [] : [{ expectation: i + 1, kept: expectation.kept, expect: scenario?.expectations?.[i]?.expect ?? null }],
    ),
    /** Of the scenario's own expectations (ticket 86: an earlier round's changes kept, a round undone), the share that hold at the end; null with none. */
    scenarioExpectationsHold: scenarioExpectationsHold(raw.scenarioExpectations),
    /** A scenario test that held before the Agent started is a broken test, not a change applied. */
    shownBefore: raw.changes.filter((change) => change.shownBefore).map((change) => change.id),
    /** Likewise a scenario expectation that held before when it is not to (by number, from 1). */
    expectationsHeldBefore: (raw.scenarioExpectations ?? []).flatMap((expectation, i) => (expectation.before && !expectation.kept ? [i + 1] : [])),
    /** And one to be kept that did not hold before the Agent started: the scenario set up wrong, or its test. */
    keptNotHeldBefore: (raw.scenarioExpectations ?? []).flatMap((expectation, i) => (!expectation.before && expectation.kept ? [i + 1] : [])),
  };
}

type Measures = ReturnType<typeof measureFolder>;

/** A change in a list of misses: `change n (kind; expect)`. */
const changeWords = (change: { id: number; kind: string; expect: string | null }) => `change ${change.id} (${change.kind}; ${change.expect ?? "?"})`;

/** One line on a run, as it ends. */
function oneLine(m: Measures): string {
  const seconds = (ms: number | null) => (ms === null ? "–" : `${Math.round(ms / 1000)}s`);
  const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);
  const mark = (yes: boolean | null) => (yes === null ? "–" : yes ? "✓" : "✗");
  const expectations = m.scenarioExpectationsHold === null ? "" : `, scenario expectations ${percent(m.scenarioExpectationsHold)}`;
  return `round ${seconds(m.applyMs)}, ${m.toolCalls} tool calls, 1:1 ${percent(m.oneToOneByPage)} (checks ${percent(m.oneToOneByChecks)}), done ${mark(m.ranDone)}, finish ${mark(m.ranFinish)}, report ${mark(m.reportCompliant)}${expectations}`;
}

/** A yes or no as 1 or 0; null where it does not apply (a scenario with no round to apply). */
const yesNo = (value: boolean | null) => (value === null ? null : Number(value));

/** The numbers each Agent is compared by, from a run's measures. */
const METRICS: [string, (m: Measures) => number | null][] = [
  ["整轮用时 claim→finish（秒）", (m) => (m.applyMs === null ? null : m.applyMs / 1000)],
  ["整轮用时每条（秒）", (m) => (m.applyMsPerChange === null ? null : m.applyMsPerChange / 1000)],
  ["Agent 总用时（秒）", (m) => m.agentMs / 1000],
  ["每条平均工具调用", (m) => m.toolCallsPerChange],
  ["全仓搜索次数", (m) => m.repoWideSearches],
  ["读 node_modules/humantouch（次）", (m) => m.packageReads],
  ["读入字数：Skill", (m) => m.charsRead.skill],
  ["读入字数：claim 输出", (m) => (m.changes ? m.charsRead.claim : null)],
  ["读入字数：全部工具输出", (m) => m.charsRead.total],
  ["1:1 落地率（页面预期）", (m) => m.oneToOneByPage],
  ["1:1 落地率（done 核对）", (m) => m.oneToOneByChecks],
  // Summed up over runs, not by the median: a false ✓ is rare, and each one counts (`TOTALS`).
  ["虚假的 ✓（条）", (m) => (m.changes ? m.falseChecks.length : null)],
  ["跑了 done（比例）", (m) => yesNo(m.ranDone)],
  ["跑了 finish（比例）", (m) => yesNo(m.ranFinish)],
  ["报告格式合规（比例）", (m) => yesNo(m.reportCompliant)],
  ["设计变量使用率", (m) => m.variableUse],
  // Under ⚠️ with why and instead, or under ✓ and shown (`reportedAsExpected`).
  ["落地不了 1:1 的改动报得对（比例）", (m) => m.reportedAsExpected],
  ["场景整体预期成立（比例）", (m) => m.scenarioExpectationsHold],
  ["两次进度最长间隔（秒）", (m) => (m.maxProgressGapMs === null ? null : m.maxProgressGapMs / 1000)],
  ["没进度也没改源码的最长时间（秒）", (m) => (m.maxStillMs === null ? null : m.maxStillMs / 1000)],
  ["没认领就改代码的提示（次）", (m) => m.unclaimedNotices],
  ["Agent 好像停了的提示（次）", (m) => m.stalledNotices],
  ["被权限拦下的工具调用", (m) => m.permissionDenials],
  ["子 Agent 调用", (m) => m.subagents.calls],
  ["API 重试", (m) => m.apiRetries],
];

/**
 * The rates summed up over the runs' changes, not run by run (`pooled`): the
 * goals' rate is of all the changes, and a run's rate in the middle of the
 * others' is not that.
 */
const POOLED: Record<string, (m: Measures) => { part: number; whole: number } | null> = {
  "1:1 落地率（页面预期）": (m) => m.oneToOneCounts?.byPage ?? null,
  "1:1 落地率（done 核对）": (m) => m.oneToOneCounts?.byChecks ?? null,
  "设计变量使用率": (m) => m.variables,
};

/** The counts shown by their total over the runs, not by the median. */
const TOTALS = ["虚假的 ✓（条）"];

/** The numbers the table by scenario shows: 88 lists the misses by scenario from it. */
const BY_SCENARIO = [
  "整轮用时每条（秒）",
  "每条平均工具调用",
  "1:1 落地率（页面预期）",
  "虚假的 ✓（条）",
  "设计变量使用率",
  "落地不了 1:1 的改动报得对（比例）",
  "场景整体预期成立（比例）",
  "两次进度最长间隔（秒）",
  "没进度也没改源码的最长时间（秒）",
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
        const values = some.map(of);
        const s = summarize(values);
        // A yes or no is summed up by how often it is yes.
        const share = name.endsWith("（比例）") && s.n ? values.reduce((total: number, value) => total + (value ?? 0), 0) / s.n : null;
        const total = values.reduce((sum: number, value) => sum + (value ?? 0), 0);
        const all = POOLED[name] ? pooled(some.map(POOLED[name])) : null;
        return [
          name,
          { median: round(s.median), min: round(s.min), max: round(s.max), n: s.n, share: round(share), total: round(total), pooled: all && { rate: round(all.rate), part: all.part, whole: all.whole }, byTotal: TOTALS.includes(name) },
        ];
      }),
    );
  const agents = [...new Set(measures.map((m) => m.agent))];
  const summary = agents.map((agent) => {
    const mine = measures.filter((m) => m.agent === agent);
    return {
      agent,
      versions: [...new Set(mine.map((m) => m.version))],
      models: [...new Set(mine.map((m) => m.model))],
      responseModels: [...new Set(mine.flatMap((m) => m.responseModels))],
      skills: [...new Set(mine.flatMap((m) => m.skills))],
      tools: [...new Set(mine.flatMap((m) => m.tools))],
      /** Each extension of others the runs had, as `name version` (ticket 92). */
      extensions: [...new Set(mine.flatMap((m) => Object.entries(m.extensions).map(([name, version]) => `${name} ${version ?? "（没装）"}`)))],
      subagentModels: [...new Set(mine.flatMap((m) => m.subagents.models))],
      efforts: [...new Set(mine.map((m) => (m.effort ? `${m.effort.set}${m.effort.seen ? `, seen ${m.effort.seen}` : ""}` : "?")))],
      skill: mine.every((m) => m.skill) ? "yes" : mine.some((m) => m.skill) ? "mixed" : "no",
      runs: mine.length,
      dates: [...new Set(mine.map((m) => m.date.slice(0, 10)))],
      overall: sum(mine),
      scenarios: Object.fromEntries([...new Set(mine.map((m) => m.scenario))].map((scenario) => [scenario, sum(mine.filter((m) => m.scenario === scenario))])),
      brokenTests: mine
        .filter((m) => m.shownBefore.length || m.expectationsHeldBefore.length)
        .map((m) => `${m.scenario} #${m.run}: ${[...m.shownBefore.map(String), ...m.expectationsHeldBefore.map((n) => `expectation ${n}`)].join(", ")}`),
      keptNotHeld: mine.filter((m) => m.keptNotHeldBefore.length).map((m) => `${m.scenario} #${m.run}: ${m.keptNotHeldBefore.map((n) => `expectation ${n}`).join(", ")}`),
      /** The misses, one by one, as `scenario #run: change n (kind; expect)`: 88 lists them by kind of change. */
      notShown: mine.flatMap((m) => m.notShown.map((change) => `${m.scenario} #${m.run}: ${changeWords(change)}`)),
      reportedWrong: mine.flatMap((m) => m.reportedWrong.map((change) => `${m.scenario} #${m.run}: ${changeWords(change)}`)),
      expectationsNotHeld: mine.flatMap((m) => m.expectationsNotHeld.map((e) => `${m.scenario} #${m.run}: expectation ${e.expectation} (${e.kept ? "kept" : "new"}; ${e.expect ?? "?"})`)),
      /** Each run whose designer's page showed a notice, and when, in seconds from the Agent's start. */
      notices: mine
        .filter((m) => m.unclaimedNotices || m.stalledNotices)
        .map((m) => {
          const at = (times: number[] | null) => (times ?? []).map((ms) => `${Math.round(ms / 1000)}s`).join(", ");
          return `${m.scenario} #${m.run}: ${[m.unclaimedNotices ? `没认领就改代码 ${at(m.unclaimedNoticesAtMs)}` : "", m.stalledNotices ? `Agent 好像停了 ${at(m.stalledNoticesAtMs)}` : ""].filter(Boolean).join("; ")}`;
        }),
    };
  });
  writeFileSync(join(out, "measures.json"), `${JSON.stringify(measures, null, 2)}\n`);
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  /** A count's total over the runs that have it; – when none does (runs before it was counted). */
  const sumOf = (s: { n: number; total: number | null }) => (s.n ? s.total : "–");
  const cell = (s: { median: number | null; min: number | null; max: number | null; n: number; share: number | null; total: number | null; pooled: { rate: number | null; part: number; whole: number } | null; byTotal: boolean }) =>
    s.pooled
      ? s.pooled.rate === null
        ? "–"
        : `${Math.round(s.pooled.rate * 100)}%（${s.pooled.part}/${s.pooled.whole} 条）`
      : s.byTotal
        ? `${sumOf(s)}`
        : s.share !== null
          ? `${Math.round(s.share * 100)}%`
          : s.median === null
            ? "–"
            : `${s.median}（${s.min}–${s.max}）`;
  const list = (heading: string, items: string[]) => (items.length ? ["", `${heading}：${items.join("; ")}`] : []);
  const md = summary
    .map((agent) =>
      [
        `## ${agent.agent}${agent.skill === "yes" ? "" : agent.skill === "no" ? "（不加载 Skill）" : "（加载与不加载 Skill 的运行混在一起）"}：${agent.versions.join(", ")}，模型 ${agent.models.join(", ")}${agent.responseModels.length ? `（提供商回答的模型 ${agent.responseModels.join(", ")}）` : ""}，加载的 skills ${agent.skills.join(", ") || "记录里没有"}${agent.extensions.length ? `，带 ${agent.extensions.join(", ")}` : ""}${agent.tools.length ? `，工具 ${agent.tools.join(", ")}` : ""}，effort ${agent.efforts.join("; ")}，子 Agent 模型 ${agent.subagentModels.join(", ") || "无"}，${agent.runs} 次，${agent.dates.join(", ")}`,
        "",
        "| 指标 | 中位数（范围）；比例；合计 | 次数 |",
        "|---|---|---|",
        ...METRICS.map(([name]) => `| ${name} | ${cell(agent.overall[name])} | ${agent.overall[name].n} |`),
        "",
        `| 场景 | ${BY_SCENARIO.join(" | ")} |`,
        `|---|${"---|".repeat(BY_SCENARIO.length)}`,
        ...Object.entries(agent.scenarios).map(([scenario, s]) => `| ${scenario} | ${BY_SCENARIO.map((name) => cell(s[name])).join(" | ")} |`),
        ...list("场景的预期在 Agent 开始前就成立（测试有误）", agent.brokenTests),
        ...list("该保留的场景预期在 Agent 开始前就不成立（场景搭错了，或测试有误）", agent.keptNotHeld),
        ...list("页面没显示的改动", agent.notShown),
        ...list("落地不了 1:1、报得不对的改动", agent.reportedWrong),
        ...list("没成立的场景预期", agent.expectationsNotHeld),
        // Counted from the Agent's start: the Agent at work, each is a false one (tickets 66, 67).
        "",
        `提示合计（从 Agent 开始算）：没认领就改代码 ${sumOf(agent.overall["没认领就改代码的提示（次）"])} 次，Agent 好像停了 ${sumOf(agent.overall["Agent 好像停了的提示（次）"])} 次${agent.notices.length ? `：${agent.notices.join("; ")}` : ""}`,
      ].join("\n"),
    )
    .join("\n\n");
  writeFileSync(join(out, "summary.md"), `${md}\n`);
  console.log(`\n${md}\n\nRaw results and measures: ${out}`);
}

await main(process.argv.slice(2));
