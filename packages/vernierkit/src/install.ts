/**
 * Installing Vernier Kit into a project, checking it, and taking it back
 * out: `init`, `doctor` and `remove`. What `init` changes is recorded in
 * `.vernier/install.json`, so `remove` can put back exactly what it found.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addVitePlugin, insert, mountInEntry, mountInLayout, undo, wrapNextConfig, type Edit, type FileEdit } from "./source-edits";
import { readChangeSet, readIfThere, readState, vernierFolder, writeAtomically } from "./vernier-folder";

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
/** The Skill that AGENTS.md points to. */
const SKILL_FILE = `${SKILL_FOLDERS[0]}/SKILL.md`;
const AGENTS_LINE = `Vernier Kit: to apply the designer's design changes, or undo the last round, follow \`${SKILL_FILE}\`.`;
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

/** How each package manager installs and uninstalls a package, runs a package's binary, and runs a script. */
const COMMANDS: Record<PackageManager, { install: string[]; uninstall: string[]; bin: string[]; script: string }> = {
  npm: { install: ["npm", "install", "--save-dev"], uninstall: ["npm", "uninstall"], bin: ["npx", "--no-install"], script: "npm run" },
  pnpm: { install: ["pnpm", "add", "--save-dev"], uninstall: ["pnpm", "remove"], bin: ["pnpm", "exec"], script: "pnpm" },
  yarn: { install: ["yarn", "add", "--dev"], uninstall: ["yarn", "remove"], bin: ["yarn"], script: "yarn" },
  bun: { install: ["bun", "add", "--dev"], uninstall: ["bun", "remove"], bin: ["bunx"], script: "bun run" },
};

type Command = [string, string[]];

function command(packageManager: PackageManager, kind: "install" | "uninstall" | "bin", args: string[]): Command {
  const [name, ...first] = COMMANDS[packageManager][kind];
  return [name, [...first, ...args]];
}

const show = ([name, args]: Command) => [name, ...args].join(" ");

interface Project {
  root: string;
  pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    packageManager?: string;
  };
  packageManager: PackageManager;
  framework: Framework;
}

/** What differs between Vite and Next.js: where the plugin goes and where the editor layer is mounted. */
interface Framework {
  name: string;
  /** The build config, relative to the root; null when there is none. */
  config: string | null;
  /** Whether the config imports the plugin and uses it. */
  hasPlugin(code: string): boolean;
  addPlugin(file: string, code: string): FileEdit;
  /** Where the editor layer is mounted, relative to the root; null when it cannot be found. */
  mountFile(): Promise<string | null>;
  mount(file: string, code: string): FileEdit;
  /** By hand, when the edits cannot be made. */
  pluginSteps: string;
  mountSteps: string;
  /** The production build `doctor` runs. */
  build(): Promise<Build>;
}

/** A production build: how to run it, where it writes, and what else it rewrites, to be put back. */
interface Build {
  command: Command;
  /** Where it writes, and the folders in there that hold what it built. */
  dir: string;
  built: string[];
  /** A folder of its own, to delete afterwards. */
  temporary: boolean;
  /** Project files the build rewrites, relative to the root. */
  rewrites: string[];
}

const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];

function vite(root: string, packageManager: PackageManager): Framework {
  return {
    name: "Vite",
    config: VITE_CONFIGS.find((file) => existsSync(join(root, file))) ?? null,
    hasPlugin: (code) => /["']vernierkit\/vite["']/.test(code) && /\bvernier\s*\(/.test(code),
    addPlugin: addVitePlugin,
    async mountFile() {
      const html = await readIfThere(join(root, "index.html"));
      const src = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/.exec(html)?.[1];
      if (src) return src.replace(/^\//, "");
      return ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx"].find((file) => existsSync(join(root, file))) ?? null;
    },
    mount: mountInEntry,
    pluginSteps: 'In the Vite config, import the plugin and put it first in `plugins`:\n\n  import vernier from "vernierkit/vite";\n  …\n  plugins: [vernier(), …],',
    mountSteps: 'In the entry module that renders the app, render the editor layer beside the app:\n\n  import { Vernier } from "vernierkit/react";\n  …\n  <Vernier />',
    async build() {
      // Not over the project's own build.
      const dir = await mkdtemp(join(tmpdir(), "vernierkit-build-"));
      return { command: command(packageManager, "bin", ["vite", "build", "--outDir", dir, "--emptyOutDir"]), dir, built: ["."], temporary: true, rewrites: [] };
    },
  };
}

const NEXT_CONFIGS = ["next.config.ts", "next.config.mts", "next.config.mjs", "next.config.js", "next.config.cjs"];
const LAYOUTS = ["app", "src/app"].flatMap((dir) => ["tsx", "jsx", "js", "ts"].map((extension) => `${dir}/layout.${extension}`));

function next(root: string, packageManager: PackageManager, pkg: Project["pkg"]): Framework {
  return {
    name: "Next.js",
    config: NEXT_CONFIGS.find((file) => existsSync(join(root, file))) ?? null,
    hasPlugin: (code) => /["']vernierkit\/next["']/.test(code) && /\bwithVernier\s*\(/.test(code),
    addPlugin: wrapNextConfig,
    mountFile: async () => LAYOUTS.find((file) => existsSync(join(root, file))) ?? null,
    mount: mountInLayout,
    pluginSteps: 'In the Next.js config, wrap the config it exports with `withVernier()`:\n\n  import { withVernier } from "vernierkit/next";\n  …\n  export default withVernier(nextConfig);',
    mountSteps: 'In the root layout (`app/layout.tsx`), render the editor layer at the end of <body>:\n\n  import { Vernier } from "vernierkit/react";\n  …\n  <body>\n    {children}\n    <Vernier />\n  </body>',
    // Into `.next`, as `next build` always does: from Next.js 16, `next dev` keeps to `.next/dev`.
    build: async () => ({
      // With the bundler the project builds with.
      command: command(packageManager, "bin", ["next", "build", ...(/--webpack\b/.test(pkg.scripts?.build ?? "") ? ["--webpack"] : [])]),
      dir: join(root, ".next"),
      built: ["static", "server"],
      temporary: false,
      rewrites: ["next-env.d.ts", "tsconfig.json"],
    }),
  };
}

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
  // A Next.js project may have Vite too, for Vitest.
  if (hasDependency(pkg, "next")) {
    // `latest`, `canary` and the like give no number: let them through.
    const major = Number(/\d+/.exec(pkg.dependencies?.next ?? pkg.devDependencies?.next ?? "")?.[0]);
    if (major < 16) {
      io.error("Vernier Kit works with Next.js 16 or later, and this project has an earlier one.\n");
      return null;
    }
    return { root, pkg, packageManager, framework: next(root, packageManager, pkg) };
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
    const install = command(packageManager, "install", [process.env.VERNIERKIT_INSTALL_FROM ?? "vernierkit"]);
    const result = await io.exec(...install, { cwd: root });
    if (result.code !== 0) {
      io.error(`${result.output}\nCould not install vernierkit (\`${show(install)}\` failed, above). Install it yourself, then run \`npx vernierkit init\` again.\n`);
      return 1;
    }
    record.dependency = true;
    done.push(`Installed vernierkit as a dev dependency (\`${show(install)}\`)`);
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
    const result = code.includes("vernierkit/") ? { reason: "it imports vernierkit but does not add the plugin" } : edit(file, code);
    if ("reason" in result) {
      byHand.push(`${steps}\n\n(${file}: ${result.reason}.)`);
      return;
    }
    await writeFile(join(root, file), result.text);
    record.edits = [...record.edits.filter((e) => e.file !== file), ...result.edits];
    done.push(`${file}: ${what}`);
  };
  await sourceEdit(framework.config, framework.hasPlugin, framework.addPlugin, "added the plugin", framework.pluginSteps);
  const mounted = await findMount(root);
  if (mounted) done.push(`${mounted}: mounted the editor layer already`);
  else await sourceEdit(await framework.mountFile(), () => false, framework.mount, "mounted the editor layer", framework.mountSteps);

  // The Skill, and the line in AGENTS.md that points to it.
  const skill = await readFile(SKILL_TEMPLATE, "utf8");
  for (const folder of SKILL_FOLDERS) {
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, folder, "SKILL.md"), skill);
  }
  done.push(`Skill: ${SKILL_FOLDERS.map((folder) => `${folder}/SKILL.md`).join(" and ")}`);
  await addLine(root, "AGENTS.md", AGENTS_LINE, (text) => text.includes(SKILL_FILE), record);
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
  io.write(`\nInstalled. Start the dev server (\`${COMMANDS[packageManager].script} dev\`) and open the page: the Vernier Kit toggle is at its bottom right. Then run \`npx vernierkit doctor\`.\n`);
  return 0;
}

/** Adds `line` at the end of `file`, unless `has` finds it there; makes the file when there is none. */
async function addLine(root: string, file: string, line: string, has: (text: string) => boolean, record: InstallRecord) {
  const text = await readIfThere(join(root, file));
  if (text !== null && has(text)) return;
  // An earlier `init`'s line, taken out since, is no longer there to undo.
  record.edits = record.edits.filter((edit) => edit.file !== file);
  record.created = record.created.filter((created) => created !== file);
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

/**
 * Takes Vernier Kit back out of the project `cwd` is in: undoes what `init`
 * did, line by line, deletes `.vernier/` and uninstalls the package. Not while
 * the designer has changes the Agent has not applied: they would be lost.
 */
export async function remove(cwd: string, io: InstallIo): Promise<number> {
  const found = await findPackage(cwd);
  const root = found?.root ?? cwd;
  const folder = vernierFolder(root);
  const record = await readRecord(root);
  if (!record) {
    const text = "Vernier Kit is not installed here: there is nothing to remove.";
    io.write(found && hasDependency(found.pkg, "vernierkit") ? `${text} vernierkit is a dependency, but \`init\` did not install it: uninstall it, and take out its plugin and <Vernier /> by hand.\n` : `${text}\n`);
    return 0;
  }
  if (await readState(folder)) {
    io.error("A round of design changes is being applied: finish it first (`npx vernierkit finish`), then run `npx vernierkit remove` again.\n");
    return 1;
  }
  if ((await readChangeSet(folder))?.changes.length) {
    io.error("The designer has design changes not applied yet, and removing Vernier Kit would lose them. Apply them first (`npx vernierkit claim`, as the Skill says), or have the designer discard them in the editor; then run `npx vernierkit remove` again.\n");
    return 1;
  }

  const byHand: string[] = [];
  const texts = new Map<string, string | null>();
  for (const edit of [...record.edits].reverse()) {
    if (!texts.has(edit.file)) texts.set(edit.file, await readIfThere(join(root, edit.file)));
    const text = texts.get(edit.file);
    const undone = text == null ? null : undo(text, edit);
    if (undone === null) byHand.push(`In ${edit.file}, take out what Vernier Kit added. Those lines changed since \`init\`, so they are left as they are; \`init\` made\n\n${indent(edit.before)}\n\n  into\n\n${indent(edit.after)}`);
    else texts.set(edit.file, undone);
  }
  for (const [file, text] of texts) {
    if (text === null) continue;
    if (text === "" && record.created.includes(file)) await rm(join(root, file));
    else await writeFile(join(root, file), text);
  }
  for (const folder of SKILL_FOLDERS) {
    await rm(join(root, folder), { recursive: true, force: true });
    await removeIfEmpty(root, dirname(folder));
  }
  await rm(folder.dir, { recursive: true, force: true });

  const done = [
    byHand.length ? "Took back out what `init` added, but for the lines below" : "Took the plugin, <Vernier />, the Skill and its lines in AGENTS.md and .gitignore back out",
    "Deleted .vernier/",
  ];
  if (record.dependency) {
    const uninstall = command(packageManagerOf(root, found?.pkg ?? {}), "uninstall", ["vernierkit"]);
    const result = await io.exec(...uninstall, { cwd: root });
    if (result.code === 0) done.push(`Uninstalled vernierkit (\`${show(uninstall)}\`)`);
    else byHand.push(`Uninstall vernierkit: \`${show(uninstall)}\` failed:\n\n${indent(result.output.trim())}`);
  }

  io.write(`Vernier Kit removed:\n${done.map((line) => `- ${line}\n`).join("")}`);
  if (byHand.length) {
    io.write(`\nFinish by hand:\n\n${byHand.map((step, i) => `${i + 1}. ${step}\n`).join("\n")}`);
    return 1;
  }
  return 0;
}

function indent(text: string) {
  return text.replace(/^/gm, "    ");
}

/** Deletes `dir` and the folders above it, up to the root, while they are empty. */
async function removeIfEmpty(root: string, dir: string) {
  for (; dir && dir !== "."; dir = dirname(dir)) {
    const entries = await readdir(join(root, dir)).catch(() => null);
    if (!entries || entries.length) return;
    await rm(join(root, dir), { recursive: true });
  }
}

/** Checks the installation, and that a production build has none of the editor layer in it. */
export async function doctor(cwd: string, io: InstallIo): Promise<number> {
  const project = await findProjectToInstall(cwd, io);
  if (!project) return 1;
  const { root, pkg, packageManager, framework } = project;
  const checks: [boolean, string][] = [];
  const check = (ok: boolean, good: string, bad: string) => checks.push([ok, ok ? good : bad]);

  check(hasDependency(pkg, "vernierkit"), "vernierkit is a dependency", `vernierkit is not a dependency: run \`${show(command(packageManager, "install", ["vernierkit"]))}\``);
  const config = framework.config && (await readIfThere(join(root, framework.config)));
  check(Boolean(config && framework.hasPlugin(config)), `${framework.config}: adds the plugin`, `The build config does not add the plugin. ${framework.pluginSteps}`);
  const mount = await findMount(root);
  check(Boolean(mount), `${mount}: mounts the editor layer`, `Nothing mounts the editor layer. ${framework.mountSteps}`);
  const skill = await readFile(SKILL_TEMPLATE, "utf8");
  for (const folder of SKILL_FOLDERS) {
    const there = await readIfThere(join(root, folder, "SKILL.md"));
    check(there === skill, `${folder}/SKILL.md`, there === null ? `${folder}/SKILL.md is missing: run \`npx vernierkit init\`` : `${folder}/SKILL.md is out of date: run \`npx vernierkit init\` to update it`);
  }
  const agents = await readIfThere(join(root, "AGENTS.md"));
  check(Boolean(agents?.includes(SKILL_FILE)), "AGENTS.md points to the Skill", "AGENTS.md does not point to the Skill: run `npx vernierkit init`");
  const gitignore = await readIfThere(join(root, ".gitignore"));
  check(Boolean(gitignore && ignoresVernier(gitignore)), ".gitignore ignores .vernier/", ".gitignore does not ignore .vernier/: add a line `.vernier/` to it");

  const build = await framework.build();
  const rewritten = await Promise.all(build.rewrites.map((file) => readIfThere(join(root, file))));
  try {
    const result = await io.exec(...build.command, { cwd: root });
    if (result.code !== 0) {
      check(false, "", `The production build failed (\`${show(build.command)}\`):\n${result.output}`);
    } else {
      const found = await residue(build.dir, build.built);
      check(!found.length, "A production build has none of the editor layer", `A production build has editor layer code in it: ${found.join(", ")}`);
    }
  } finally {
    if (build.temporary) await rm(build.dir, { recursive: true, force: true });
    for (const [i, file] of build.rewrites.entries()) {
      const text = rewritten[i];
      if (text !== null && (await readIfThere(join(root, file))) !== text) await writeFile(join(root, file), text);
    }
  }

  io.write(`Vernier Kit doctor (${framework.name}, ${packageManager}):\n${checks.map(([ok, text]) => `${ok ? "✓" : "✗"} ${text}\n`).join("")}`);
  const failed = checks.filter(([ok]) => !ok).length;
  io.write(failed ? `\n${failed} to fix.\n` : "\nAll good.\n");
  return failed ? 1 : 0;
}

/** The built files in the `built` folders of `dir`, relative to it, that hold some of the editor layer. */
async function residue(dir: string, built: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const folder of built) {
    if (!existsSync(join(dir, folder))) continue;
    const files = readdirSync(join(dir, folder), { recursive: true, encoding: "utf8" }).filter((file) => /\.(m?js|css|html)$/.test(file));
    for (const file of files) {
      const text = await readFile(join(dir, folder, file), "utf8");
      if (RESIDUE.some((mark) => text.includes(mark))) found.push(join(folder, file));
    }
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
