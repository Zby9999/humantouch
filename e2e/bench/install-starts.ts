/**
 * The starting points of the install bench (ticket 91): ten fresh projects,
 * each built anew, every time, by its official scaffold in the system's
 * temporary folder, as anyone starting a project gets it. Scaffolds are taken at their latest
 * version, so `scaffold` records what each resolved to.
 *
 *   node e2e/bench/install-starts.ts check [id,…]   build each start, run its own `dev` script on its default port,
 *                                                    wait for the page in Playwright's headless shell, stop it, delete it
 *
 * Nothing here opens a window: no browser but the headless one, no `--open`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import { gitStatus, replaceIn, sh } from "../tests/install-copy.ts";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface Start {
  /** Its name in the record, and the project's folder and package name. */
  id: string;
  framework: "vite" | "next";
  language: "ts" | "js";
  bundler: "vite" | "turbopack" | "webpack";
  /** Whether the app's code is under `src/`. Vite's always is; for Next.js it is create-next-app's `--src-dir`. */
  srcDir: boolean;
  packageManager: PackageManager;
  styles: "tailwind4" | "tailwind3" | "css-modules" | "css";
  react: 18 | 19;
  /** The dev server's default port, which the Agent's dev server will take. */
  port: 5173 | 3000;
  /** One line, for the record and for showing the designer. */
  description: string;
}

/** Ticket 24's ten: each kind of project it lists at least once. */
export const STARTS: Start[] = [
  {
    id: "vite-ts-npm-css",
    framework: "vite",
    language: "ts",
    bundler: "vite",
    srcDir: true,
    packageManager: "npm",
    styles: "css",
    react: 19,
    port: 5173,
    description: "Vite + React 19, TypeScript, npm, plain CSS as create-vite gives it",
  },
  {
    id: "vite-js-pnpm-tw4",
    framework: "vite",
    language: "js",
    bundler: "vite",
    srcDir: true,
    packageManager: "pnpm",
    styles: "tailwind4",
    react: 19,
    port: 5173,
    description: "Vite + React 19, JavaScript, pnpm, Tailwind v4 by its Vite guide (@tailwindcss/vite)",
  },
  {
    id: "vite-ts-yarn-tw3",
    framework: "vite",
    language: "ts",
    bundler: "vite",
    srcDir: true,
    packageManager: "yarn",
    styles: "tailwind3",
    react: 19,
    port: 5173,
    description: "Vite + React 19, TypeScript, yarn, Tailwind v3 by its Vite guide (PostCSS)",
  },
  {
    id: "vite-ts-bun-css",
    framework: "vite",
    language: "ts",
    bundler: "vite",
    srcDir: true,
    packageManager: "bun",
    styles: "css",
    react: 19,
    port: 5173,
    description: "Vite + React 19, TypeScript, bun, plain CSS as create-vite gives it",
  },
  {
    id: "vite-ts-npm-react18-tw4",
    framework: "vite",
    language: "ts",
    bundler: "vite",
    srcDir: true,
    packageManager: "npm",
    styles: "tailwind4",
    react: 18,
    port: 5173,
    description: "Vite + React 18 (react, react-dom and their types at 18), TypeScript, npm, Tailwind v4 by its Vite guide",
  },
  {
    id: "next-turbo-npm-tw4",
    framework: "next",
    language: "ts",
    bundler: "turbopack",
    srcDir: false,
    packageManager: "npm",
    styles: "tailwind4",
    react: 19,
    port: 3000,
    description: "Next.js App Router, TypeScript, Turbopack, no src/, npm, Tailwind v4 as create-next-app gives it",
  },
  {
    id: "next-webpack-src-pnpm-modules",
    framework: "next",
    language: "ts",
    bundler: "webpack",
    srcDir: true,
    packageManager: "pnpm",
    styles: "css-modules",
    react: 19,
    port: 3000,
    description: "Next.js App Router, TypeScript, webpack (`next dev --webpack`), src/, pnpm, CSS Modules as create-next-app gives them",
  },
  {
    id: "next-turbo-src-yarn-modules",
    framework: "next",
    language: "ts",
    bundler: "turbopack",
    srcDir: true,
    packageManager: "yarn",
    styles: "css-modules",
    react: 19,
    port: 3000,
    description: "Next.js App Router, TypeScript, Turbopack, src/, yarn, CSS Modules as create-next-app gives them",
  },
  {
    id: "next-webpack-bun-tw4",
    framework: "next",
    language: "ts",
    bundler: "webpack",
    srcDir: false,
    packageManager: "bun",
    styles: "tailwind4",
    react: 19,
    port: 3000,
    description: "Next.js App Router, TypeScript, webpack (`next dev --webpack`), no src/, bun, Tailwind v4 through PostCSS",
  },
  {
    id: "next-turbo-pnpm-tw3",
    framework: "next",
    language: "ts",
    bundler: "turbopack",
    srcDir: false,
    packageManager: "pnpm",
    styles: "tailwind3",
    react: 19,
    port: 3000,
    description: "Next.js App Router, TypeScript, Turbopack, no src/, pnpm, Tailwind v3 by its Next.js guide (PostCSS)",
  },
];

/** Directories the bench and the Agent need on PATH for the four package managers (pnpm is in ~/.npm-global/bin, bun in ~/.bun/bin, yarn is corepack's shim beside node). */
export function packageManagerPath(): string[] {
  return [join(homedir(), ".npm-global/bin"), join(homedir(), ".bun/bin"), dirname(process.execPath)];
}

/** The environment every command here runs in: the package managers on PATH, and corepack never asking before it fetches yarn. */
function env(): NodeJS.ProcessEnv {
  return { PATH: [...packageManagerPath(), process.env.PATH ?? ""].join(delimiter), COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" };
}

const COMMIT = ["-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-qm"];

/**
 * The scaffold's command line for `start`, run by its own package manager, in
 * the folder the project is made in, with `version` the scaffold's latest.
 * Yarn 1's `create` takes no version (it runs `global add create-<name>`,
 * which takes the latest).
 */
export function createCommand(start: Start, version: string): string[] {
  const pm = start.packageManager;
  const name = start.framework === "vite" ? "vite" : "next-app";
  const at = pm === "yarn" ? name : `${name}@${version}`;
  const create = pm === "npm" ? ["npm", "create", "--yes", at, start.id, "--"] : [pm, "create", at, start.id];
  if (start.framework === "vite") {
    return [...create, "--template", start.language === "ts" ? "react-ts" : "react", "--no-interactive", "--no-immediate"];
  }
  return [
    ...create,
    start.language === "ts" ? "--ts" : "--js",
    "--app",
    start.srcDir ? "--src-dir" : "--no-src-dir",
    // Tailwind v3 is added by its own guide, to the project without Tailwind.
    start.styles === "tailwind4" ? "--tailwind" : "--no-tailwind",
    "--no-eslint",
    "--no-biome",
    "--no-react-compiler",
    "--no-cache-components",
    "--import-alias",
    "@/*",
    "--agents-md",
    "--no-agent-feedback",
    `--use-${pm}`,
    // Installed below, once the styles are as the start asks; the bench makes the one git repository.
    "--skip-install",
    "--disable-git",
    // Every choice is on the command line; this only keeps it from asking.
    "--yes",
  ];
}

/** The command that adds `packages` to the project, as dependencies or devDependencies. */
function addCommand(pm: PackageManager, packages: string[], dev: boolean): string[] {
  const flag = { npm: "--save-dev", pnpm: "--save-dev", yarn: "--dev", bun: "--dev" }[pm];
  return [pm, pm === "npm" ? "install" : "add", ...(dev ? [flag] : []), ...packages];
}

/** Tailwind v3's config and PostCSS config, as `tailwindcss init -p` writes them, with the guide's `content`. */
function tailwind3Configs(start: Start): Record<string, string> {
  const esm = start.framework === "vite"; // Vite's package.json says "type": "module".
  const content =
    start.framework === "vite"
      ? `["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`
      : `[\n    "./app/**/*.{js,ts,jsx,tsx,mdx}",\n    "./pages/**/*.{js,ts,jsx,tsx,mdx}",\n    "./components/**/*.{js,ts,jsx,tsx,mdx}",\n    "./src/**/*.{js,ts,jsx,tsx,mdx}",\n  ]`;
  const exported = esm ? "export default" : "module.exports =";
  return {
    "tailwind.config.js": `/** @type {import('tailwindcss').Config} */\n${exported} {\n  content: ${content},\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n}\n`,
    "postcss.config.js": `${exported} {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n`,
  };
}

/** Where the start's global stylesheet is. */
function globalCss(start: Start): string {
  if (start.framework === "vite") return "src/index.css";
  return start.srcDir ? "src/app/globals.css" : "app/globals.css";
}

/** Puts `text` at the top of a file of the project. */
function prepend(dir: string, file: string, text: string) {
  writeFileSync(join(dir, file), text + readFileSync(join(dir, file), "utf8"));
}

/**
 * What the scaffold does not give and the start asks for, by the official
 * guides, before anything is installed: Tailwind, React 18, webpack. Returns
 * the commands that add packages, run after.
 */
function convert(start: Start, dir: string): string[][] {
  const pm = start.packageManager;
  const adds: string[][] = [];
  if (start.framework === "vite" && start.styles === "tailwind4") {
    // tailwindcss.com/docs/installation/using-vite
    const config = start.language === "ts" ? "vite.config.ts" : "vite.config.js";
    replaceIn(dir, config, "import { defineConfig } from 'vite'\n", "import { defineConfig } from 'vite'\nimport tailwindcss from '@tailwindcss/vite'\n");
    replaceIn(dir, config, "plugins: [react()]", "plugins: [react(), tailwindcss()]");
    prepend(dir, globalCss(start), '@import "tailwindcss";\n\n');
    adds.push(addCommand(pm, ["tailwindcss", "@tailwindcss/vite"], false));
  }
  if (start.styles === "tailwind3") {
    // v3.tailwindcss.com/docs/guides/vite and /nextjs
    for (const [file, text] of Object.entries(tailwind3Configs(start))) writeFileSync(join(dir, file), text);
    prepend(dir, globalCss(start), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n");
    adds.push(addCommand(pm, ["tailwindcss@3", "postcss", "autoprefixer"], true));
  }
  if (start.react === 18) {
    adds.push(addCommand(pm, ["react@18", "react-dom@18"], false));
    if (start.language === "ts") adds.push(addCommand(pm, ["@types/react@18", "@types/react-dom@18"], true));
  }
  if (start.bundler === "webpack") {
    // What create-next-app writes for webpack, which it keeps but no longer offers on its command line.
    const file = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    pkg.scripts.dev = "next dev --webpack";
    pkg.scripts.build = "next build --webpack";
    if (start.styles === "tailwind4") {
      // Taken out by hand keeps the order; added by the package manager, sorted as it writes package.json. A
      // package.json ordered by hand gets reordered by bun or npm the next time either adds or removes a package
      // (`init`, `remove`), and git would see that as a change `remove` left (ticket 91, walk 1).
      delete pkg.devDependencies["@tailwindcss/turbopack"];
      adds.push(addCommand(pm, ["@tailwindcss/postcss@^4"], true));
      replaceIn(dir, "next.config.ts", `  turbopack: {\n    rules: {\n      "*.css": {\n        loaders: ["@tailwindcss/turbopack"],\n        as: "*.css",\n      },\n    },\n  },\n`);
      writeFileSync(join(dir, "postcss.config.mjs"), `const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`);
    }
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return adds;
}

/** The installed version of `name` in the project, or null. */
function installed(dir: string, name: string): string | null {
  const file = join(dir, "node_modules", name, "package.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).version : null;
}

/** Runs a command of the project's, logging its command line. */
async function run(command: string[], cwd: string, log: (line: string) => void): Promise<string> {
  log(`$ ${command.join(" ")}`);
  const [binary, ...args] = command;
  return sh(binary!, args, cwd, env());
}

/**
 * Builds the start fresh, from its official scaffold, in the system's temporary
 * folder: dependencies installed, `git init`, everything committed.
 * `versions` is what the scaffold resolved to, and the package manager's own.
 * `made` is told how to delete the folder as soon as there is one.
 */
export async function scaffold(start: Start, log: (line: string) => void, made?: (remove: () => void) => void): Promise<{ dir: string; versions: Record<string, string>; remove(): void }> {
  const folder = mkdtempSync(join(tmpdir(), "humantouch-install-"));
  const remove = () => rmSync(folder, { recursive: true, force: true });
  // Told at once, so a bench stopped mid-scaffold can delete it (run-install.ts).
  made?.(remove);
  try {
    const dir = join(folder, start.id);
    const scaffolder = start.framework === "vite" ? "create-vite" : "create-next-app";
    const version = (await run(["npm", "view", scaffolder, "version"], folder, log)).trim();
    await run(createCommand(start, version), folder, log);
    for (const command of convert(start, dir)) await run(command, dir, log);
    await run([start.packageManager, "install"], dir, log);
    const pkg = readFileSync(join(dir, "package.json"), "utf8");
    // Corepack may pin yarn in package.json; it would do it by now, so it is committed with the rest.
    if (JSON.parse(pkg).packageManager) log(`package.json names its package manager: ${JSON.parse(pkg).packageManager}`);
    await run(["git", "init", "-q"], dir, log);
    await run(["git", "add", "-A"], dir, log);
    await run(["git", ...COMMIT, `Fresh ${start.id}`], dir, log);
    const left = await gitStatus(dir);
    if (left) throw new Error(`${start.id} is not all committed:\n${left}`);
    const versions: Record<string, string> = { [scaffolder]: version, [start.packageManager]: (await run([start.packageManager, "--version"], dir, log)).trim() };
    for (const name of ["vite", "next", "react", "react-dom", "@types/react", "tailwindcss", "typescript"]) {
      const found = installed(dir, name);
      if (found) versions[name] = found;
    }
    log(`versions: ${JSON.stringify(versions)}`);
    return { dir, versions, remove };
  } catch (error) {
    remove();
    throw error;
  }
}

/** Whether something listens on `port` of this machine, on IPv4 or IPv6. */
export async function portInUse(port: number): Promise<boolean> {
  const tries = ["127.0.0.1", "::1"].map(
    (host) =>
      new Promise<boolean>((resolve) => {
        const socket = connect({ host, port });
        socket.once("connect", () => (socket.destroy(), resolve(true)));
        socket.once("error", () => resolve(false));
      }),
  );
  return (await Promise.all(tries)).some(Boolean);
}

/** The command that runs the project's `dev` script. */
export function devCommand(pm: PackageManager): string[] {
  return pm === "pnpm" || pm === "yarn" ? [pm, "dev"] : [pm, "run", "dev"];
}

export interface StartCheck {
  id: string;
  versions: Record<string, string>;
  /** Seconds to scaffold, convert, install and commit. */
  scaffoldSeconds: number;
  /** Seconds from `dev` starting to the page answering. */
  devSeconds: number;
  /** Whether Tailwind's base styles are on the page (its Preflight makes every border solid). */
  tailwind: boolean;
}

/**
 * Checks a start end to end, with no Agent: builds it, runs its own `dev`
 * script on its default port, waits until the page answers in Playwright's
 * headless shell with something on it and with Tailwind there exactly when the
 * start has it, stops the server's whole process group, and deletes the
 * project. Throws if the port is taken before, the page never comes, `dev`
 * left the project changed, or the port is still taken after.
 */
export async function checkStart(start: Start, log: (line: string) => void): Promise<StartCheck> {
  if (await portInUse(start.port)) throw new Error(`Something already listens on port ${start.port}: the check stops, and stops nothing it did not start`);
  const began = Date.now();
  const project = await scaffold(start, log);
  const scaffoldSeconds = (Date.now() - began) / 1000;
  const [binary, ...args] = devCommand(start.packageManager);
  log(`$ ${[binary, ...args].join(" ")}`);
  const devStart = Date.now();
  const server = spawn(binary!, args, { cwd: project.dir, env: { ...process.env, ...env() }, stdio: "ignore", detached: true });
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = `http://localhost:${start.port}/`;
    for (const until = Date.now() + 120_000; ; ) {
      if (server.exitCode !== null) throw new Error(`${start.id}: dev exited with ${server.exitCode}`);
      const response = await page.goto(url, { timeout: 60_000 }).catch(() => null);
      if (response?.ok()) break;
      if (Date.now() > until) throw new Error(`${start.id}: no page on ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 });
    const devSeconds = (Date.now() - devStart) / 1000;
    const tailwind = await page.evaluate(() => getComputedStyle(document.documentElement).borderTopStyle === "solid");
    if (tailwind !== start.styles.startsWith("tailwind")) throw new Error(`${start.id}: Tailwind's base styles are ${tailwind ? "" : "not "}on the page`);
    return { id: start.id, versions: project.versions, scaffoldSeconds, devSeconds, tailwind };
  } finally {
    await browser.close();
    if (server.exitCode === null && server.pid) {
      process.kill(-server.pid, "SIGTERM");
      const killed = setTimeout(() => server.pid && process.kill(-server.pid, "SIGKILL"), 10_000);
      await stopped;
      clearTimeout(killed);
    }
    for (const until = Date.now() + 10_000; await portInUse(start.port); ) {
      if (Date.now() > until) throw new Error(`${start.id}: port ${start.port} is still taken after dev stopped`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const left = await gitStatus(project.dir).catch(() => "");
    project.remove();
    if (left) throw new Error(`${start.id}: dev left the project changed:\n${left}`);
  }
}

if (import.meta.main) {
  const [command, ids] = process.argv.slice(2);
  if (command !== "check") throw new Error("Usage: node e2e/bench/install-starts.ts check [id,…]");
  const chosen = ids ? ids.split(",").map((id) => STARTS.find((start) => start.id === id)) : STARTS;
  if (chosen.includes(undefined)) throw new Error(`Starts are ${STARTS.map((start) => start.id).join(", ")}`);
  let failed = 0;
  for (const start of chosen as Start[]) {
    console.log(`\n# ${start.id}: ${start.description}`);
    try {
      const result = await checkStart(start, (line) => console.log(`  ${line}`));
      console.log(`  ok: scaffolded in ${result.scaffoldSeconds.toFixed(0)} s, page in ${result.devSeconds.toFixed(1)} s`);
    } catch (error) {
      failed++;
      console.log(`  FAILED: ${(error as Error).message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
