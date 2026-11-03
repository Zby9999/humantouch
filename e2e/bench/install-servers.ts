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

const execFileAsync = promisify(execFile);

export interface ProcessRow {
  pid: number;
  ppid: number;
  pgid: number;
  command: string;
}

/** A dev server found: who listens, on what port, started how. */
export interface Server {
  pid: number;
  port: number;
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

/** Every process on the machine, with its process group. */
export async function processes(): Promise<ProcessRow[]> {
  return (await output("ps", ["-axww", "-o", "pid=,ppid=,pgid=,command="])).split("\n").flatMap((line) => {
    const [, pid, ppid, pgid, command] = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line) ?? [];
    return pid ? [{ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), command }] : [];
  });
}

/** The processes under `roots`, the roots among them. */
export function under(rows: Pick<ProcessRow, "pid" | "ppid">[], roots: Iterable<number>): Set<number> {
  const found = new Set(roots);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { pid, ppid } of rows) {
      if (!found.has(pid) && found.has(ppid)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return found;
}

/** lsof's `-F` output, by process: each `p<pid>` line, and the `n<name>` lines after it. */
export function lsofNames(text: string): { pid: number; names: string[] }[] {
  const rows: { pid: number; names: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("p")) rows.push({ pid: Number(line.slice(1)), names: [] });
    else if (line.startsWith("n") && rows.length) rows.at(-1)!.names.push(line.slice(1));
  }
  return rows;
}

/** Every TCP port in LISTEN on the machine, by the process that holds it. */
export async function listening(): Promise<{ pid: number; port: number }[]> {
  const rows = lsofNames(await output("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]));
  const seen = new Set<string>();
  return rows.flatMap(({ pid, names }) =>
    names.flatMap((name) => {
      const port = Number(/:(\d+)$/.exec(name)?.[1]);
      const key = `${pid}:${port}`;
      if (!port || seen.has(key)) return [];
      seen.add(key);
      return [{ pid, port }];
    }),
  );
}

/** The folder each process works in; all of them when `pids` is not given. */
async function workingFolders(pids?: number[]): Promise<Map<number, string>> {
  if (pids && !pids.length) return new Map();
  const args = pids ? ["-a", "-p", pids.join(","), "-d", "cwd", "-Fpn"] : ["-d", "cwd", "-Fpn"];
  return new Map(lsofNames(await output("lsof", args)).flatMap(({ pid, names }) => (names[0] ? [[pid, names[0]] as const] : [])));
}

/** Whether something holds `port` in LISTEN, by anyone. */
export async function portTaken(port: number): Promise<boolean> {
  return (await output("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])).trim() !== "";
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The processes of one run's Agent: found while it works, stopped when the bench is done with them. */
export class AgentProcesses {
  /** Every process seen under the Agent, by pid, with its command line then (a pid taken again by another command is not the same process). */
  readonly seen = new Map<number, string>();
  readonly folders: string[];
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
    const rows = await processes();
    if (this.agentPid !== null && alive(this.agentPid)) {
      for (const pid of under(rows, [this.agentPid])) if (!this.seen.has(pid)) this.seen.set(pid, rows.find((row) => row.pid === pid)?.command ?? "");
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
      .map(({ pid, port }) => ({ pid, port, command: rows.find((row) => row.pid === pid)?.command ?? "" }));
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
   * then SIGKILL to what is left after `graceMs`. Never the bench itself.
   */
  async stop(graceMs = 5000): Promise<{ stopped: { pid: number; command: string }[]; killed: number[] }> {
    const rows = await processes();
    const folders = await workingFolders();
    const roots = rows.filter(({ pid }) => this.mine(pid, rows) || this.inProject(folders.get(pid))).map(({ pid }) => pid);
    const bench = new Set<number>();
    for (let pid: number | undefined = process.pid; pid && !bench.has(pid); pid = rows.find((row) => row.pid === pid)?.ppid) bench.add(pid);
    const targets = new Set([...under(rows, roots)].filter((pid) => !bench.has(pid)));
    const stopped = rows.filter(({ pid }) => targets.has(pid)).map(({ pid, command }) => ({ pid, command }));
    const signal = (name: NodeJS.Signals) => {
      for (const pgid of new Set(rows.filter(({ pid }) => targets.has(pid) && alive(pid)).map(({ pgid }) => pgid))) {
        const group = rows.filter((row) => row.pgid === pgid);
        const whole = group.every(({ pid }) => targets.has(pid));
        for (const target of whole ? [-pgid] : group.filter(({ pid }) => targets.has(pid)).map(({ pid }) => pid)) {
          try {
            process.kill(target, name);
          } catch {
            // Gone already.
          }
        }
      }
    };
    signal("SIGTERM");
    for (const end = Date.now() + graceMs; Date.now() < end && [...targets].some(alive); ) await new Promise((resolve) => setTimeout(resolve, 100));
    const killed = [...targets].filter(alive);
    if (killed.length) signal("SIGKILL");
    return { stopped, killed };
  }
}
