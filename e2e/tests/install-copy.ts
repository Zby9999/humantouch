import { execFile, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const PACKAGE = fileURLToPath(new URL("../../packages/humantouch/", import.meta.url));
/** The command line as `npx humantouch` runs it before the project has it: from the package being tested. */
export const CLI = join(PACKAGE, "dist/cli.js");

/** Runs a command; resolves with what it printed. When it fails, the error says what it printed too. */
export const sh = async (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  try {
    const { stdout } = await promisify(execFile)(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(`${(error as Error).message}\n${stdout ?? ""}${stderr ?? ""}`);
  }
};

/** The package as it would be published, packed into `dir`: `init` installs it from there. */
export async function pack(dir: string): Promise<string> {
  await sh("pnpm", ["pack", "--pack-destination", dir], PACKAGE);
  const { version } = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));
  return join(dir, `humantouch-${version}.tgz`);
}

/**
 * A copy of an example project in a temporary folder, with Human Touch taken
 * out by `uninstall`, its dependencies installed, and committed to a git
 * repository of its own: what a project looks like before `init`.
 */
export async function copyWithoutHumanTouch(example: string, uninstall: (dir: string) => void): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "03kind-project-"));
  cpSync(example, dir, { recursive: true, filter: (from) => !/[\\/](node_modules|dist|\.humantouch|\.next)$/.test(from) });
  const pkgFile = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  delete pkg.devDependencies["humantouch"];
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  uninstall(dir);
  appendFileSync(join(dir, ".gitignore"), "node_modules\ndist\n");
  // From the store the workspace already filled.
  await sh("pnpm", ["install", "--prefer-offline"], dir);
  await sh("git", ["init", "-q"], dir);
  await sh("git", ["add", "-A"], dir);
  await sh("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "Before Human Touch"], dir);
  return dir;
}

/** Replaces `from` with `to` in a file of the project; throws when `from` is not there, so the copy never silently keeps it. */
export function replaceIn(dir: string, file: string, from: string, to = "") {
  const path = join(dir, file);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`${file} has no ${JSON.stringify(from)}`);
  writeFileSync(path, text.replace(from, to));
}

/** `git status`, short: empty when the project is as it was committed. */
export const gitStatus = (dir: string) => sh("git", ["status", "--porcelain", "--untracked-files=all"], dir);

/** How long a stopped server's processes get to end before they are killed. */
const STOP_MS = 5000;

/**
 * Starts a dev server; stop it with `stop()`, which resolves once it has
 * exited: its process group is asked to end, and killed if it has not in a
 * few seconds. A server that has exited already is left as it is.
 */
export function startServer(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): ChildProcess & { stop(): Promise<void> } {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const signal = (name: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, name);
    } catch {
      // Gone already (ESRCH).
    }
  };
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    signal("SIGTERM");
    const timer = setTimeout(() => signal("SIGKILL"), STOP_MS);
    await exited;
    clearTimeout(timer);
  };
  return Object.assign(child, { stop });
}
