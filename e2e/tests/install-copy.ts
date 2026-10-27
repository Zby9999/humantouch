import { execFile, spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const PACKAGE = fileURLToPath(new URL("../../packages/vernierkit/", import.meta.url));
/** The command line as `npx vernierkit` runs it before the project has it: from the package being tested. */
export const CLI = join(PACKAGE, "dist/cli.js");

export const sh = async (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  const { stdout } = await promisify(execFile)(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

/** The package as it would be published, packed into `dir`: `init` installs it from there. */
export async function pack(dir: string): Promise<string> {
  await sh("pnpm", ["pack", "--pack-destination", dir], PACKAGE);
  const { version } = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));
  return join(dir, `vernierkit-${version}.tgz`);
}

/**
 * A copy of an example project in a temporary folder, with Vernier Kit taken
 * out by `uninstall`, its dependencies installed, and committed to a git
 * repository of its own: what a project looks like before `init`.
 */
export async function copyWithoutVernier(example: string, uninstall: (dir: string) => void): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "vernierkit-project-"));
  cpSync(example, dir, { recursive: true, filter: (from) => !/[\\/](node_modules|dist|\.vernier|\.next)$/.test(from) });
  const pkgFile = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  delete pkg.devDependencies.vernierkit;
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  uninstall(dir);
  writeFileSync(join(dir, ".gitignore"), "node_modules\ndist\n.next\n");
  // From the store the workspace already filled.
  await sh("pnpm", ["install", "--prefer-offline"], dir);
  await sh("git", ["init", "-q"], dir);
  await sh("git", ["add", "-A"], dir);
  await sh("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "Before Vernier Kit"], dir);
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

/** Starts a dev server; stop it with `stop()`. */
export function startServer(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): ChildProcess & { stop(): void } {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  return Object.assign(child, { stop: () => void (child.pid && process.kill(-child.pid, "SIGTERM")) });
}
