/**
 * The dev servers an installing Agent starts (ticket 91), found by what the
 * machine shows, never by what the Agent says: the TCP ports in LISTEN held
 * by processes the Agent started, that is processes under its own (as long as
 * it runs; each is remembered once seen) or processes working in the run's
 * project (a server started detached is handed to launchd, and keeps only its
 * folder). Only those are ever stopped.
 */
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { sep } from "node:path";
import { promisify } from "node:util";
import { descendants, processTable, type ProcessRow } from "./agents.ts";

const execFileAsync = promisify(execFile);

/** A dev server found: who listens, on what port, and the page's address as the listening socket has it. */
export interface Server {
  pid: number;
  port: number;
  url: string;
  command: string;
}

/** What a command prints; lsof says nothing found by failing, and that is no error here. */
async function output(command: string, args: string[]): Promise<string> {
  try {
    return (await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

/** lsof's `-F` output, by process: each `p<pid>` line, and the `n<name>` lines after it. */
function lsofNames(text: string): { pid: number; names: string[] }[] {
  const rows: { pid: number; names: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("p")) rows.push({ pid: Number(line.slice(1)), names: [] });
    else if (line.startsWith("n") && rows.length) rows.at(-1)!.names.push(line.slice(1));
  }
  return rows;
}

/**
 * The page's address for a socket lsof names as `host:port`: on every
 * address (`*`) is `localhost`; `127.0.0.1` and `[::1]` stay as they are, so
 * a server on IPv6 alone is opened there.
 */
function pageUrl(name: string): string | null {
  const [, host, port] = /^(.*):(\d+)$/.exec(name) ?? [];
  if (!port) return null;
  return `http://${host === "*" ? "localhost" : host}:${port}`;
}

/** Every TCP port in LISTEN on the machine, by the process that holds it, with the page's address. */
async function listening(): Promise<{ pid: number; port: number; url: string }[]> {
  const rows = lsofNames(await output("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]));
  const seen = new Set<string>();
  return rows.flatMap(({ pid, names }) =>
    names.flatMap((name) => {
      const url = pageUrl(name);
      const port = Number(/:(\d+)$/.exec(name)?.[1]);
      const key = `${pid}:${port}`;
      if (!url || seen.has(key)) return [];
      seen.add(key);
      return [{ pid, port, url }];
    }),
  );
}

/** The folder each process works in; all of them when `pids` is not given. */
async function workingFolders(pids?: number[]): Promise<Map<number, string>> {
  if (pids && !pids.length) return new Map();
  const args = pids ? ["-a", "-p", pids.join(","), "-d", "cwd", "-Fpn"] : ["-d", "cwd", "-Fpn"];
  return new Map(lsofNames(await output("lsof", args)).flatMap(({ pid, names }) => (names[0] ? [[pid, names[0]] as const] : [])));
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Waits up to `ms` for every one of `pids` to be gone. */
async function gone(pids: number[], ms: number) {
  for (const end = Date.now() + ms; Date.now() < end && pids.some(alive); ) await new Promise((resolve) => setTimeout(resolve, 100));
}

/** The processes of one run's Agent: found while it works, stopped when the bench is done with them. */
export class AgentProcesses {
  /** Every process seen under the Agent, by pid, with its command line then (a pid taken again by another command is not the same process). */
  readonly seen = new Map<number, string>();
  readonly folders: string[];
  /** The Agent's own process while it runs; null before it starts and once it has exited (its pid may be taken again). */
  agentPid: number | null = null;

  constructor(project: string) {
    // As lsof names it: /var/folders is /private/var/folders on macOS.
    this.folders = [...new Set([project, realpathSync(project)])];
  }

  private inProject(folder: string | undefined) {
    return folder !== undefined && this.folders.some((dir) => folder === dir || folder.startsWith(`${dir}${sep}`));
  }

  /** Remembers what is under the Agent now; the process table it looked at. */
  async track(): Promise<ProcessRow[]> {
    const rows = await processTable();
    if (this.agentPid !== null && alive(this.agentPid)) {
      for (const pid of descendants(rows, [this.agentPid])) if (!this.seen.has(pid)) this.seen.set(pid, rows.find((row) => row.pid === pid)?.command ?? "");
    }
    return rows;
  }

  /** Looks once: what is under the Agent now, and the dev servers the Agent's processes listen with. */
  async look(): Promise<Server[]> {
    const rows = await this.track();
    const ports = (await listening()).filter(({ pid }) => pid !== process.pid);
    const strangers = [...new Set(ports.map(({ pid }) => pid).filter((pid) => !this.mine(pid, rows)))];
    const folders = await workingFolders(strangers);
    return ports
      .filter(({ pid }) => this.mine(pid, rows) || this.inProject(folders.get(pid)))
      .map((server) => ({ ...server, command: rows.find((row) => row.pid === server.pid)?.command ?? "" }));
  }

  /** Whether `pid` is a process seen under the Agent, still running the same command. */
  private mine(pid: number, rows: ProcessRow[]) {
    const command = this.seen.get(pid);
    return command !== undefined && rows.find((row) => row.pid === pid)?.command === command;
  }

  /**
   * Stops every process the Agent started and left: seen under it, or working
   * in the project, and what is under those. A process group goes whole when
   * all of it is the Agent's; else each of its processes on its own. SIGTERM,
   * then SIGKILL to what is left after `graceMs`, and a wait until those are
   * gone too, so their ports are free when this returns. Never the bench itself.
   */
  async stop(graceMs = 5000): Promise<{ stopped: { pid: number; command: string }[]; killed: number[] }> {
    const rows = await processTable();
    const folders = await workingFolders();
    const roots = rows.filter(({ pid }) => this.mine(pid, rows) || this.inProject(folders.get(pid))).map(({ pid }) => pid);
    const bench = new Set<number>();
    for (let pid: number | undefined = process.pid; pid && !bench.has(pid); pid = rows.find((row) => row.pid === pid)?.ppid) bench.add(pid);
    const targets = [...descendants(rows, roots)].filter((pid) => !bench.has(pid));
    const stopped = rows.filter(({ pid }) => targets.includes(pid)).map(({ pid, command }) => ({ pid, command }));
    const signal = (name: NodeJS.Signals) => {
      for (const pgid of new Set(rows.filter(({ pid }) => targets.includes(pid) && alive(pid)).map(({ pgid }) => pgid!))) {
        const group = rows.filter((row) => row.pgid === pgid);
        const whole = group.every(({ pid }) => targets.includes(pid));
        for (const target of whole ? [-pgid] : group.filter(({ pid }) => targets.includes(pid)).map(({ pid }) => pid)) {
          try {
            process.kill(target, name);
          } catch {
            // Gone already.
          }
        }
      }
    };
    signal("SIGTERM");
    await gone(targets, graceMs);
    const killed = targets.filter(alive);
    if (killed.length) {
      signal("SIGKILL");
      await gone(killed, graceMs);
    }
    return { stopped, killed };
  }
}
