/**
 * Installing Vernier Kit into a project, checking it, and taking it back
 * out: `init`, `doctor` and `remove`. What `init` changes is recorded in
 * `.vernier/install.json`, so `remove` can put back exactly what it found.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { addVitePlugin, insert, mountInEntry, undo, type Edit, type FileEdit } from "./source-edits";
import { readIfThere, vernierFolder, writeAtomically } from "./vernier-folder";

/** Runs a command in `cwd`; resolves with its exit code and what it printed. */
export type Exec = (command: string, args: string[], options: { cwd: string }) => Promise<{ code: number; output: string }>;

export interface InstallIo {
  write(text: string): void;
  error(text: string): void;
  exec: Exec;
}

/** What `init` did, for `remove` to undo. */
interface InstallRecord {
  /** `init` installed the package, so `remove` uninstalls it. */
  dependency: boolean;
  /** Lines changed in existing files, and in files `init` made. */
  edits: Edit[];
  /** Files `init` made: once their edits are undone and nothing else is left in them, they go. */
  created: string[];
}

const SKILL_FOLDERS = [".agents/skills/vernierkit", ".claude/skills/vernierkit"];
const SKILL_TEMPLATE = fileURLToPath(new URL("../skill/SKILL.md", import.meta.url));
const AGENTS_LINE = `Vernier Kit: to apply the designer's design changes, or undo the last round, follow \`${SKILL_FOLDERS[0]}/SKILL.md\`.`;
const IGNORE_LINE = ".vernier/";
/** What only the editor layer brings: none of it may be in a production build. */
const RESIDUE = ["vernier-kit", "data-vk-", "__VERNIERKIT__"];

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

interface Project {
  root: string;
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; packageManager?: string };
  packageManager: PackageManager;
  framework: Framework;
}

/** What differs between Vite and Next.js: where the plugin goes and where the editor layer is mounted. */
interface Framework {
  name: string;
  /** The build config, relative to the root; null when there is none. */
  config: string | null;
  addPlugin(file: string, code: string): FileEdit;
  /** Where the editor layer is mounted, relative to the root; null when it cannot be found. */
  mountFile(root: string): Promise<string | null>;
  mount(file: string, code: string): FileEdit;
  /** By hand, when the edits cannot be made. */
  pluginSteps: string;
  mountSteps: string;
  /** The production build, into `outDir`. */
  build(outDir: string): [string, string[]];
}

const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];

function vite(root: string, packageManager: PackageManager): Framework {
  return {
    name: "Vite",
    config: VITE_CONFIGS.find((file) => existsSync(join(root, file))) ?? null,
    addPlugin: addVitePlugin,
    async mountFile(root) {
      const html = await readIfThere(join(root, "index.html"));
      const src = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/.exec(html)?.[1];
      if (src) return src.replace(/^\//, "");
      return ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx"].find((file) => existsSync(join(root, file))) ?? null;
    },
    mount: mountInEntry,
    pluginSteps: 'In the Vite config, import the plugin and put it first in `plugins`:\n\n  import vernier from "vernierkit/vite";\n  …\n  plugins: [vernier(), …],',
    mountSteps: 'In the entry module that renders the app, render the editor layer beside the app:\n\n  import { Vernier } from "vernierkit/react";\n  …\n  <Vernier />',
    build: (outDir) => run(packageManager, ["vite", "build", "--outDir", outDir, "--emptyOutDir"]),
  };
}

/** A package's binary, through the package manager. */
function run(packageManager: PackageManager, args: string[]): [string, string[]] {
  switch (packageManager) {
    case "npm":
      return ["npx", ["--no-install", ...args]];
    case "bun":
      return ["bunx", args];
    default:
      return [packageManager, ["exec", ...args]];
  }
}

function installCommand(packageManager: PackageManager, spec: string): [string, string[]] {
  switch (packageManager) {
    case "npm":
      return ["npm", ["install", "--save-dev", spec]];
    case "yarn":
    case "bun":
      return [packageManager, ["add", "--dev", spec]];
    case "pnpm":
      return ["pnpm", ["add", "--save-dev", spec]];
  }
}

function uninstallCommand(packageManager: PackageManager): [string, string[]] {
  return packageManager === "npm" ? ["npm", ["uninstall", "vernierkit"]] : [packageManager, ["remove", "vernierkit"]];
}

const show = ([command, args]: [string, string[]]) => [command, ...args].join(" ");

/** The project `cwd` is in: the nearest folder up with a package.json, with what it is built with. */
async function findPackage(cwd: string): Promise<{ root: string; pkg: Project["pkg"] } | null> {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const text = await readIfThere(join(dir, "package.json"));
    if (text !== null) return { root: dir, pkg: JSON.parse(text) };
    if (dirname(dir) === dir) return null;
  }
}

function packageManagerOf(root: string, pkg: Project["pkg"]): PackageManager {
  // The lockfile may be further up, at a workspace's root.
  for (let dir = root; ; dir = dirname(dir)) {
    const found = LOCKFILES.find(([file]) => existsSync(join(dir, file)));
    if (found) return found[1];
    if (dirname(dir) === dir) break;
  }
  const named = pkg.packageManager?.split("@")[0];
  return LOCKFILES.some(([, manager]) => manager === named) ? (named as PackageManager) : "npm";
}

function hasDependency(pkg: Project["pkg"], name: string) {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

async function findProjectToInstall(cwd: string, io: InstallIo): Promise<Project | null> {
  const found = await findPackage(cwd);
  if (!found) {
    io.error("No package.json here or in any folder above: run this in your project's folder.\n");
    return null;
  }
  const { root, pkg } = found;
  const packageManager = packageManagerOf(root, pkg);
  if (!hasDependency(pkg, "react")) {
    io.error("Vernier Kit works with React projects, and this one does not depend on react.\n");
    return null;
  }
  if (!hasDependency(pkg, "vite") && !VITE_CONFIGS.some((file) => existsSync(join(root, file)))) {
    io.error("Vernier Kit works with Vite and Next.js projects, and this one uses neither.\n");
    return null;
  }
  return { root, pkg, packageManager, framework: vite(root, packageManager) };
}

async function readRecord(root: string): Promise<InstallRecord | null> {
  const text = await readIfThere(installRecordFile(root));
  return text === null ? null : (JSON.parse(text) as InstallRecord);
}

function installRecordFile(root: string) {
  return join(vernierFolder(root).dir, "install.json");
}

/** Installs Vernier Kit into the project `cwd` is in. */
export async function init(cwd: string, io: InstallIo): Promise<number> {
  const project = await findProjectToInstall(cwd, io);
  if (!project) return 1;
  const { root, pkg, packageManager, framework } = project;
  const record: InstallRecord = (await readRecord(root)) ?? { dependency: false, edits: [], created: [] };
  const done: string[] = [];
  const byHand: string[] = [];

  if (hasDependency(pkg, "vernierkit")) {
    done.push("vernierkit is a dependency already");
  } else {
    const command = installCommand(packageManager, process.env.VERNIERKIT_INSTALL_FROM ?? "vernierkit");
    const result = await io.exec(command[0], command[1], { cwd: root });
    if (result.code !== 0) {
      io.error(`${result.output}\nCould not install vernierkit (\`${show(command)}\` failed, above). Install it yourself, then run \`npx vernierkit init\` again.\n`);
      return 1;
    }
    record.dependency = true;
    done.push(`Installed vernierkit as a dev dependency (\`${show(command)}\`)`);
  }

  // The project's source: the build config, and where the editor layer is mounted.
  const sourceEdit = async (file: string | null, isDone: (code: string) => boolean, edit: (file: string, code: string) => FileEdit, what: string, steps: string) => {
    const code = file && (await readIfThere(join(root, file)));
    if (!file || code === null) {
      byHand.push(`${steps}\n\n(${what}: the file could not be found.)`);
      return;
    }
    if (isDone(code)) {
      done.push(`${file}: ${what} already`);
      return;
    }
    const result = edit(file, code);
    if ("reason" in result) {
      byHand.push(`${steps}\n\n(${file}: ${result.reason}.)`);
      return;
    }
    await writeFile(join(root, file), result.text);
    record.edits.push(...result.edits);
    done.push(`${file}: ${what}`);
  };
  await sourceEdit(framework.config, (code) => code.includes("vernierkit/"), framework.addPlugin, "added the plugin", framework.pluginSteps);
  const mounted = await findMount(root);
  if (mounted) done.push(`${mounted}: mounted the editor layer already`);
  else await sourceEdit(await framework.mountFile(root), () => false, framework.mount, "mounted the editor layer", framework.mountSteps);

  // The Skill, and the line in AGENTS.md that points to it.
  const skill = await readFile(SKILL_TEMPLATE, "utf8");
  for (const folder of SKILL_FOLDERS) {
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, folder, "SKILL.md"), skill);
  }
  done.push(`Skill: ${SKILL_FOLDERS.map((folder) => `${folder}/SKILL.md`).join(" and ")}`);
  await addLine(root, "AGENTS.md", AGENTS_LINE, (text) => text.includes(`${SKILL_FOLDERS[0]}/SKILL.md`), record);
  done.push("AGENTS.md: points to the Skill");
  await addLine(root, ".gitignore", IGNORE_LINE, ignoresVernier, record);
  done.push(".gitignore: ignores .vernier/");

  await mkdir(vernierFolder(root).dir, { recursive: true });
  await writeAtomically(installRecordFile(root), `${JSON.stringify(record, null, 2)}\n`);

  io.write(`Vernier Kit (${framework.name}, ${packageManager}):\n${done.map((line) => `- ${line}\n`).join("")}`);
  if (byHand.length) {
    io.write(`\nFinish by hand:\n\n${byHand.map((step, i) => `${i + 1}. ${step}\n`).join("\n")}\nThen run \`npx vernierkit doctor\`.\n`);
    return 1;
  }
  io.write(`\nInstalled. Start the dev server (\`${packageManager === "npm" ? "npm run" : packageManager} dev\`) and open the page: the Vernier Kit toggle is at its bottom right. Then run \`npx vernierkit doctor\`.\n`);
  return 0;
}

/** Adds `line` at the end of `file`, unless `has` finds it there; makes the file when there is none. */
async function addLine(root: string, file: string, line: string, has: (text: string) => boolean, record: InstallRecord) {
  const text = await readIfThere(join(root, file));
  if (text !== null && has(text)) return;
  if (text === null) record.created.push(file);
  const before = text ?? "";
  const result = insert(file, before, [{ at: before.length, text: `${before && !before.endsWith("\n") ? "\n" : ""}${line}\n` }]);
  await writeFile(join(root, file), result.text);
  record.edits.push(...result.edits);
}

function ignoresVernier(gitignore: string) {
  return gitignore.split(/\r?\n/).some((line) => /^\/?\.vernier(\/(\*\*?)?)?$/.test(line.trim()));
}

/** The project file that mounts the editor layer, if one does. */
async function findMount(root: string): Promise<string | null> {
  for (const file of await sourceFiles(root)) {
    const code = await readFile(join(root, file), "utf8");
    if (code.includes("vernierkit/react")) return file;
  }
  return null;
}

/** The project's JavaScript and TypeScript modules, outside dependencies and builds. */
async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!/^(node_modules|dist|build|out|public)$/.test(entry.name) && !entry.name.startsWith(".")) await visit(path);
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  await visit("");
  return files;
}

/** Checks the installation, and that a production build has none of the editor layer in it. */
export async function doctor(cwd: string, io: InstallIo): Promise<number> {
  const project = await findProjectToInstall(cwd, io);
  if (!project) return 1;
  const { root, pkg, packageManager, framework } = project;
  const checks: [boolean, string][] = [];
  const check = (ok: boolean, good: string, bad: string) => checks.push([ok, ok ? good : bad]);

  check(hasDependency(pkg, "vernierkit"), "vernierkit is a dependency", `vernierkit is not a dependency: run \`${show(installCommand(packageManager, "vernierkit"))}\``);
  const config = framework.config && (await readIfThere(join(root, framework.config)));
  check(Boolean(config?.includes("vernierkit/")), `${framework.config}: adds the plugin`, `The build config does not add the plugin. ${framework.pluginSteps}`);
  const mount = await findMount(root);
  check(Boolean(mount), `${mount}: mounts the editor layer`, `Nothing mounts the editor layer. ${framework.mountSteps}`);
  const skill = await readFile(SKILL_TEMPLATE, "utf8");
  for (const folder of SKILL_FOLDERS) {
    const there = await readIfThere(join(root, folder, "SKILL.md"));
    check(there === skill, `${folder}/SKILL.md`, there === null ? `${folder}/SKILL.md is missing: run \`npx vernierkit init\`` : `${folder}/SKILL.md is out of date: run \`npx vernierkit init\` to update it`);
  }
  const agents = await readIfThere(join(root, "AGENTS.md"));
  check(Boolean(agents?.includes(`${SKILL_FOLDERS[0]}/SKILL.md`)), "AGENTS.md points to the Skill", "AGENTS.md does not point to the Skill: run `npx vernierkit init`");
  const gitignore = await readIfThere(join(root, ".gitignore"));
  check(Boolean(gitignore && ignoresVernier(gitignore)), ".gitignore ignores .vernier/", ".gitignore does not ignore .vernier/: add a line `.vernier/` to it");

  const outDir = await mkdtemp(join(tmpdir(), "vernierkit-build-"));
  try {
    const command = framework.build(outDir);
    const result = await io.exec(command[0], command[1], { cwd: root });
    if (result.code !== 0) {
      check(false, "", `The production build failed (\`${show(command)}\`):\n${result.output}`);
    } else {
      const found = await residue(outDir);
      check(!found.length, "A production build has none of the editor layer", `A production build has editor layer code in it: ${found.join(", ")}`);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }

  io.write(`Vernier Kit doctor (${framework.name}, ${packageManager}):\n${checks.map(([ok, text]) => `${ok ? "✓" : "✗"} ${text}\n`).join("")}`);
  const failed = checks.filter(([ok]) => !ok).length;
  io.write(failed ? `\n${failed} to fix.\n` : "\nAll good.\n");
  return failed ? 1 : 0;
}

/** The built files, relative to `dir`, that hold some of the editor layer. */
async function residue(dir: string): Promise<string[]> {
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((file) => /\.(m?js|css|html)$/.test(file));
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    if (RESIDUE.some((mark) => text.includes(mark))) found.push(relative(dir, join(dir, file)));
  }
  return found;
}

export const defaultExec: Exec = (command, args, { cwd }) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ code: 1, output: `${output}${error.message}\n` }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
