/**
 * The install bench (ticket 91): each start is built fresh by its official
 * scaffold, an Agent is given README's "For Agents" steps word for word, and
 * the bench times it to the toggle on the dev server the Agent started, then
 * runs `doctor` itself, stops the Agent's dev servers, runs `remove`, and
 * judges the install by ticket 91's criteria. Pages open in Playwright's
 * headless shell only: nothing takes the designer's focus.
 *
 *   pnpm bench:install [--agents claude,pi,scripted] [--starts id,…] [--runs 1]
 *                      [--package npm|local]   03kind@latest from the registry (the steps as README has them), or this
 *                                              repository's package, packed: step 1 then runs `npx -y file:<the .tgz> init`,
 *                                              and the Agent's environment has TK_INSTALL_FROM=<the .tgz> for `init`
 *                      [--plant no-dev-server|extra-edit|asks|leaves-file]   the scripted Agent goes wrong in that way
 *                      [--out <dir>]
 *   pnpm bench:install summary <dir>   judge the raw results in <dir> again, and sum them up
 *
 * `claude` and `pi` run as the applying bench runs them, with the install
 * lists (install-allowlist.ts); `scripted` is
 * scripted-agent.ts, for walking the bench through before the package is
 * published. Runs go one after another, never side by side, each on the
 * start's default port (5173 or 3000), which must be free: the bench stops
 * rather than stop what holds it. Raw results go to
 * `bench-results/install/<when>/`, which git ignores.
 */
import { chromium, type Browser } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOGGLE_LABEL } from "../playwright.config.ts";
import { pack } from "../tests/install-copy.ts";
import { agentVersion, AGENTS, cleanEnv, runAgent, type AgentRun, type AgentSpec } from "./agents.ts";
import { installClaudeArgs, prepareInstallPi } from "./install-allowlist.ts";
import { forAgents, judgeInstall, toldToLook, withLocalPackage, type Judged } from "./install-judge.ts";
import { AgentProcesses, portTaken, type Server } from "./install-servers.ts";
import { packageManagerPath, portInUse, scaffold, STARTS, type Start } from "./install-starts.ts";
import { parseTranscript, summarize } from "./metrics.ts";
import { PLANTS, type Plant } from "./scripted-agent.ts";

const RESULTS = fileURLToPath(new URL("../../bench-results/install/", import.meta.url));
const README = fileURLToPath(new URL("../../README.md", import.meta.url));
const SCRIPTED = fileURLToPath(new URL("./scripted-agent.ts", import.meta.url));

/** The Agents the install bench knows: the scripted one stands in for a real one before the package is published. */
export type InstallAgent = "claude" | "pi" | "scripted";
const INSTALL_AGENTS: InstallAgent[] = ["claude", "pi", "scripted"];

/** Longest an Agent gets for an install. */
const AGENT_TIMEOUT_MS = 10 * 60_000;
/** How often the bench looks for the Agent's dev servers, and at their pages. */
const LOOK_MS = 250;
/** How long the bench keeps looking for the toggle once the Agent has ended. */
const GRACE_MS = 15_000;
/** The default ports of the starts' dev servers: free before each run. */
const DEFAULT_PORTS = [5173, 3000];

/**
 * How each Agent is run for the install: Claude and pi as the applying bench
 * runs them, but for the install lists (install-allowlist.ts); the scripted
 * Agent by node. Claude's lists are on its command line; pi's in a file
 * beside the bench's extension, so its command line is the applying bench's.
 */
function installSpec(agent: InstallAgent, plant: Plant | null): Pick<AgentSpec, "binary" | "args" | "prepare"> {
  if (agent === "claude") return { binary: AGENTS.claude.binary, args: installClaudeArgs };
  if (agent === "pi") return { binary: AGENTS.pi.binary, args: AGENTS.pi.args, prepare: prepareInstallPi };
  return { binary: () => process.execPath, args: (_folder, prompt = "") => [SCRIPTED, prompt, ...(plant ? ["--plant", plant] : [])], prepare: undefined };
}

/** The Agent whose transcript form a run's is: the scripted Agent writes Claude Code's. */
const transcriptForm = (agent: InstallAgent) => (agent === "pi" ? "pi" : "claude");

/** The command line as a person would type it, for the record. */
function commandLine(spec: Pick<AgentSpec, "binary" | "args" | "prepare">, prompt: string): string {
  return [spec.binary(), ...spec.args("<run folder>", prompt)].map((part) => (/^[\w./:,=-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`)).join(" ");
}

/**
 * The environment the Agent installs in, and the bench runs `doctor` and
 * `remove` in: the applying bench's, with the four package managers on PATH,
 * corepack never asking before it fetches yarn, and, with a local package,
 * `init` pointed at it.
 */
function installEnv(tarball: string | null): NodeJS.ProcessEnv {
  const env = cleanEnv();
  return { ...env, PATH: [...packageManagerPath(), env.PATH].join(delimiter), COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", ...(tarball && { TK_INSTALL_FROM: tarball }) };
}

/** What a run leaves for judging, besides the transcript, the diffs and what `doctor` and `remove` printed. */
interface RawInstall {
  agent: InstallAgent;
  start: Start;
  run: number;
  date: string;
  agentVersion: string;
  /** The model the transcript names, and the effort the command line sets and the run shows (null for the scripted Agent). */
  model: string | null;
  effort: { set: string; seen: string | null } | null;
  /** What the start's scaffold and its packages resolved to. */
  versions: Record<string, string>;
  package: { source: "npm" | "local"; tarball: string | null };
  /** What the Agent was told, exactly. */
  prompt: string;
  commandLine: string;
  plant: Plant | null;
  exitCode: number | null;
  timedOut: boolean;
  /** The Agent's start (t0) and the end of its whole session, in ms since the epoch. */
  startedAt: number;
  endedAt: number;
  headedBrowsers: string[];
  /** From t0 to the toggle found on the page, or null; and the dev server it was found on. */
  buttonMs: number | null;
  server: Server | null;
  /** Every dev server of the Agent's seen listening, and what the bench stopped after it ended. */
  serversSeen: Server[];
  stopped: { pid: number; command: string }[];
  killed: number[];
  /** Ports of the Agent's servers still taken once they were stopped: none, or the next run cannot start. */
  portsLeft: number[];
  criteria: Judged[];
  success: boolean;
  finalMessage: string;
  /** Step 3, recorded only: whether the last message tells the designer to look for the round button at the bottom right. */
  step3Told: boolean;
}

async function main(argv: string[]) {
  if (argv[0] === "summary") return writeSummary(argv[1]);
  const option = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const agents = (option("agents") ?? "claude,pi").split(",") as InstallAgent[];
  for (const agent of agents) if (!INSTALL_AGENTS.includes(agent)) throw new Error(`No Agent ${agent}: ${INSTALL_AGENTS.join(", ")}`);
  const ids = option("starts")?.split(",");
  for (const id of ids ?? []) if (!STARTS.some((start) => start.id === id)) throw new Error(`No start ${id}: ${STARTS.map((start) => start.id).join(", ")}`);
  const starts = ids ? STARTS.filter((start) => ids.includes(start.id)) : STARTS;
  const source = option("package") ?? "npm";
  if (source !== "npm" && source !== "local") throw new Error(`--package is npm or local, not ${source}`);
  const runs = Number(option("runs") ?? 1);
  const plant = (option("plant") ?? null) as Plant | null;
  if (plant && !PLANTS.includes(plant)) throw new Error(`No plant ${plant}: ${PLANTS.join(", ")}`);
  if (plant && agents.some((agent) => agent !== "scripted")) throw new Error("--plant is for the scripted Agent only: --agents scripted");
  const specs = Object.fromEntries(agents.map((agent) => [agent, installSpec(agent, plant)]));

  const packDir = source === "local" ? mkdtempSync(join(tmpdir(), "03kind-install-pack-")) : null;
  try {
    const tarball = packDir && (await pack(packDir));
    const steps = forAgents(readFileSync(README, "utf8"));
    const prompt = tarball ? withLocalPackage(steps, tarball) : steps;
    const out = option("out") ?? join(RESULTS, new Date().toISOString().replace(/[:.]/g, "-"));
    console.log(`${agents.length * starts.length * runs} installs: ${agents.join(", ")} × ${starts.length} starts × ${runs}, 03kind from ${tarball ?? "npm (03kind@latest)"}${plant ? `, planted ${plant}` : ""}. Raw results in ${out}`);

    const versions: Partial<Record<InstallAgent, string>> = {};
    for (const agent of agents) versions[agent] = agent === "scripted" ? `scripted-agent.ts, node ${process.version}` : await agentVersion(agent);
    mkdirSync(out, { recursive: true });
    if (existsSync(join(out, "meta.json"))) throw new Error(`${out} has a round of installs already: start one of its own`);
    const meta = { versions, package: { source, tarball }, prompt, plant, starts: starts.map((start) => start.id), commandLines: Object.fromEntries(agents.map((agent) => [agent, commandLine(specs[agent], prompt)])) };
    writeFileSync(join(out, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

    const browser = await chromium.launch();
    const failures: string[] = [];
    try {
      for (let run = 1; run <= runs; run++) {
        for (const start of starts) {
          for (const agent of agents) {
            // Never stopped by the bench: it did not start it.
            for (const port of DEFAULT_PORTS) if ((await portInUse(port)) || (await portTaken(port))) throw new Error(`Port ${port} is in use, and the Agent's dev server would take another: free it, then run the bench again`);
            const folder = join(out, agent, start.id, `run-${run}`);
            mkdirSync(folder, { recursive: true });
            const began = Date.now();
            try {
              const raw = await installOnce({ browser, start, agent, run, folder, prompt, tarball, plant, spec: specs[agent], agentVersion: versions[agent]! });
              console.log(`${raw.success ? "✓" : "✗"} ${agent} ${start.id} #${run}: ${Math.round((Date.now() - began) / 1000)}s, ${oneLine(raw)}`);
              if (raw.portsLeft.length) throw new Error(`port ${raw.portsLeft.join(", ")} still taken after the Agent's servers were stopped: stopped`);
            } catch (error) {
              failures.push(`${agent} ${start.id} #${run}: ${(error as Error).message}`);
              console.log(`✗ ${agent} ${start.id} #${run}: ${(error as Error).message}`);
              writeFileSync(join(folder, "error.txt"), `${(error as Error).stack}\n`);
              if (!browser.isConnected() || /still taken/.test((error as Error).message)) throw error;
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
    writeSummary(out);
    if (failures.length) process.exitCode = 1;
  } finally {
    if (packDir) rmSync(packDir, { recursive: true, force: true });
  }
}

/** What git says, even when it exits 1 (`git diff --no-index` with a difference). */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => execFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (_error, stdout) => resolve(stdout)));
}

/** The project's state against the start's commit: `git status`, and `git diff HEAD` with each untracked file as a new one. */
async function gitState(dir: string): Promise<{ status: string; diff: string }> {
  const status = await git(["status", "--porcelain", "--untracked-files=all"], dir);
  let diff = await git(["diff", "HEAD"], dir);
  for (const line of status.split("\n").filter((line) => line.startsWith("?? "))) diff += await git(["diff", "--no-index", "--", "/dev/null", line.slice(3)], dir);
  return { status, diff };
}

/** What the project's own command line prints for `command` (`doctor`, `remove`), whether it passes or not. */
async function projectCli(dir: string, command: string, env: NodeJS.ProcessEnv): Promise<string> {
  const cli = join(dir, "node_modules/03kind/dist/cli.js");
  if (!existsSync(cli)) return `node_modules/03kind/dist/cli.js is not there: 03kind is not installed.\n`;
  return new Promise((resolve) =>
    execFile(process.execPath, [cli, command], { cwd: dir, env, maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 }, (error, stdout, stderr) =>
      resolve(`${stdout}${stderr}${error ? `\n(exit code ${error.code ?? "?"}${error.killed ? ", stopped after 5 minutes" : ""})\n` : ""}`),
    ),
  );
}

/**
 * Looks for the toggle on the pages of the Agent's dev servers, from its
 * start until it is found, or until the Agent has ended and `GRACE_MS` more
 * have gone by: a server it started just before it ended may not listen yet.
 */
async function watchForToggle(browser: Browser, servers: AgentProcesses, start: Start, ended: () => number | null, seen: Map<string, Server>): Promise<{ at: number; server: Server } | null> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    for (;;) {
      const endedAt = ended();
      if (endedAt !== null && Date.now() > endedAt + GRACE_MS) return null;
      // The start's own port first: a server listens on others too (a debugger, a worker's).
      const up = (await servers.look()).sort((a, b) => Number(b.port === start.port) - Number(a.port === start.port));
      for (const server of up) seen.set(`${server.pid}:${server.port}`, server);
      for (const server of up) {
        try {
          await page.goto(`http://localhost:${server.port}`, { timeout: 60_000 });
          await page.getByRole("button", { name: TOGGLE_LABEL }).waitFor({ state: "visible", timeout: 3000 });
          return { at: Date.now(), server };
        } catch {
          // Not up yet, still compiling, or no toggle on it yet: looked at again.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, LOOK_MS));
    }
  } finally {
    await context.close().catch(() => {});
  }
}

/** One install by one Agent in a fresh build of one start, its raw results written to `folder`. */
async function installOnce({
  browser,
  start,
  agent,
  run,
  folder,
  prompt,
  tarball,
  plant,
  spec,
  agentVersion,
}: {
  browser: Browser;
  start: Start;
  agent: InstallAgent;
  run: number;
  folder: string;
  prompt: string;
  tarball: string | null;
  plant: Plant | null;
  spec: Pick<AgentSpec, "binary" | "args" | "prepare">;
  agentVersion: string;
}): Promise<RawInstall> {
  const log: string[] = [];
  const project = await scaffold(start, (line) => log.push(line)).finally(() => writeFileSync(join(folder, "scaffold.log"), `${log.join("\n")}\n`));
  const servers = new AgentProcesses(project.dir);
  try {
    const env = installEnv(tarball);
    const seen = new Map<string, Server>();
    let endedAt: number | null = null;
    let watching: Promise<{ at: number; server: Server } | null> = Promise.resolve(null);
    let agentRun: AgentRun;
    // What the Agent starts after the toggle is found is its too: looked for as long as it runs.
    const tracking = setInterval(() => void servers.track().catch(() => {}), 500);
    try {
      agentRun = await runAgent(agent === "pi" ? "pi" : "claude", project.dir, folder, AGENT_TIMEOUT_MS, prompt, {
        spec,
        env,
        leaveRunning: true,
        onStart(pid) {
          servers.agentPid = pid;
          watching = watchForToggle(browser, servers, start, () => endedAt, seen);
        },
      });
    } finally {
      endedAt = Date.now();
      clearInterval(tracking);
    }
    const found = await watching;
    const transcript = parseTranscript(transcriptForm(agent), readFileSync(join(folder, "transcript.jsonl"), "utf8"));
    const afterAgent = await gitState(project.dir);
    writeFileSync(join(folder, "status.txt"), afterAgent.status);
    writeFileSync(join(folder, "diff.patch"), afterAgent.diff);

    // The servers go before doctor: its production build needs none of them, and a Next.js one
    // would watch the files the build rewrites (next-env.d.ts, tsconfig.json) and puts back.
    const { stopped, killed } = await servers.stop();
    const portsLeft: number[] = [];
    for (const port of new Set([...seen.values()].map((server) => server.port))) if (await portTaken(port)) portsLeft.push(port);

    const doctor = await projectCli(project.dir, "doctor", env);
    writeFileSync(join(folder, "doctor.txt"), doctor);
    const removed = await projectCli(project.dir, "remove", env);
    writeFileSync(join(folder, "remove.txt"), removed);
    const afterRemove = await gitState(project.dir);
    writeFileSync(join(folder, "status-after-remove.txt"), afterRemove.status);
    writeFileSync(join(folder, "diff-after-remove.patch"), afterRemove.diff);

    const buttonMs = found ? found.at - agentRun.startedAt : null;
    const criteria = judgeInstall({ buttonMs, transcript, doctor, ...afterAgent, afterRemove });
    const raw: RawInstall = {
      agent,
      start,
      run,
      date: new Date(agentRun.startedAt).toISOString(),
      agentVersion,
      model: transcript.model,
      effort: agent === "scripted" ? null : { set: AGENTS[agent].effort, seen: AGENTS[agent].effortSeen?.(folder) ?? null },
      versions: project.versions,
      package: { source: tarball ? "local" : "npm", tarball },
      prompt,
      commandLine: commandLine(spec, prompt),
      plant,
      exitCode: agentRun.exitCode,
      timedOut: agentRun.timedOut,
      startedAt: agentRun.startedAt,
      endedAt: agentRun.endedAt,
      headedBrowsers: agentRun.headedBrowsers,
      buttonMs,
      server: found?.server ?? null,
      serversSeen: [...seen.values()],
      stopped,
      killed,
      portsLeft,
      criteria,
      success: criteria.every((c) => c.pass),
      finalMessage: transcript.finalText,
      step3Told: toldToLook(transcript.finalText),
    };
    writeFileSync(join(folder, "raw.json"), `${JSON.stringify(raw, null, 2)}\n`);
    return raw;
  } finally {
    // Again, on a crash before they were stopped: nothing of the Agent's is left running.
    await servers.stop().catch(() => {});
    project.remove();
  }
}

/** One line on an install, as it ends. */
function oneLine(raw: RawInstall): string {
  const failed = raw.criteria.filter((c) => !c.pass);
  const button = raw.buttonMs === null ? "no toggle" : `toggle at ${(raw.buttonMs / 1000).toFixed(1)}s`;
  return `${button}, session ${Math.round((raw.endedAt - raw.startedAt) / 1000)}s, step 3 ${raw.step3Told ? "told" : "not told"}${failed.map((c) => `\n    ✗ ${c.criterion}: ${c.why}`).join("")}`;
}

/** Judges every install in `out` again, by the rules as they are now, and writes `summary.json` and `summary.md` beside them. */
function writeSummary(out: string) {
  const installs: RawInstall[] = [];
  for (const agent of readdirSync(out).filter((name) => INSTALL_AGENTS.includes(name as InstallAgent))) {
    for (const start of readdirSync(join(out, agent)))
      for (const run of readdirSync(join(out, agent, start))) {
        const folder = join(out, agent, start, run);
        if (!existsSync(join(folder, "raw.json"))) continue;
        const raw: RawInstall = JSON.parse(readFileSync(join(folder, "raw.json"), "utf8"));
        const read = (file: string) => readFileSync(join(folder, file), "utf8");
        const transcript = parseTranscript(transcriptForm(raw.agent), read("transcript.jsonl"));
        const criteria = judgeInstall({ buttonMs: raw.buttonMs, transcript, doctor: read("doctor.txt"), status: read("status.txt"), diff: read("diff.patch"), afterRemove: { status: read("status-after-remove.txt"), diff: read("diff-after-remove.patch") } });
        installs.push({ ...raw, criteria, success: criteria.every((c) => c.pass), step3Told: toldToLook(transcript.finalText) });
      }
  }
  const seconds = (ms: number | null) => (ms === null ? null : Math.round(ms / 100) / 10);
  const summary = [...new Set(installs.map((raw) => raw.agent))].map((agent) => {
    const mine = installs.filter((raw) => raw.agent === agent);
    const button = summarize(mine.map((raw) => raw.buttonMs));
    const session = summarize(mine.map((raw) => raw.endedAt - raw.startedAt));
    return {
      agent,
      versions: [...new Set(mine.map((raw) => raw.agentVersion))],
      models: [...new Set(mine.map((raw) => raw.model ?? "?"))],
      efforts: [...new Set(mine.map((raw) => (raw.effort ? `${raw.effort.set}${raw.effort.seen ? `, seen ${raw.effort.seen}` : ""}` : "–")))],
      packages: [...new Set(mine.map((raw) => raw.package.tarball ?? "03kind@latest"))],
      plants: [...new Set(mine.map((raw) => raw.plant ?? "none"))],
      runs: mine.length,
      successes: mine.filter((raw) => raw.success).length,
      buttonSeconds: { median: seconds(button.median), max: seconds(button.max), found: button.n },
      sessionSeconds: { median: seconds(session.median), max: seconds(session.max) },
      failures: mine.flatMap((raw) => raw.criteria.filter((c) => !c.pass).map((c) => ({ criterion: c.criterion, start: raw.start.id, run: raw.run, why: c.why }))),
      step3Told: mine.filter((raw) => raw.step3Told).length,
      byStart: Object.fromEntries(
        [...new Set(mine.map((raw) => raw.start.id))].map((id) => {
          const runs = mine.filter((raw) => raw.start.id === id);
          return [id, { runs: runs.length, successes: runs.filter((raw) => raw.success).length, buttonSeconds: runs.map((raw) => seconds(raw.buttonMs)), sessionSeconds: runs.map((raw) => seconds(raw.endedAt - raw.startedAt)) }];
        }),
      ),
    };
  });
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const md = summary
    .map((agent) =>
      [
        `## ${agent.agent}：${agent.versions.join(", ")}，模型 ${agent.models.join(", ")}，effort ${agent.efforts.join("; ")}，包 ${agent.packages.join(", ")}${agent.plants.some((plant) => plant !== "none") ? `，故意出错 ${agent.plants.join(", ")}` : ""}`,
        "",
        `- 成功 ${agent.successes} / ${agent.runs}`,
        `- 到切换按钮出现（秒）：中位数 ${agent.buttonSeconds.median ?? "–"}，最长 ${agent.buttonSeconds.max ?? "–"}（找到 ${agent.buttonSeconds.found} 次）`,
        `- Agent 整个会话（秒）：中位数 ${agent.sessionSeconds.median ?? "–"}，最长 ${agent.sessionSeconds.max ?? "–"}`,
        `- 第 3 步告诉设计师去看右下角的按钮：${agent.step3Told} / ${agent.runs}`,
        "",
        "| 起点 | 成功 | 到按钮（秒） | 会话（秒） |",
        "|---|---|---|---|",
        ...Object.entries(agent.byStart).map(([id, s]) => `| ${id} | ${s.successes} / ${s.runs} | ${s.buttonSeconds.map((value) => value ?? "–").join(", ")} | ${s.sessionSeconds.join(", ")} |`),
        ...(agent.failures.length ? ["", "没过的：", ...agent.failures.map((f) => `- ${f.criterion}，${f.start} #${f.run}：${f.why}`)] : []),
      ].join("\n"),
    )
    .join("\n\n");
  writeFileSync(join(out, "summary.md"), `${md}\n`);
  console.log(`\n${md}\n\nRaw results: ${out}`);
}

await main(process.argv.slice(2));
