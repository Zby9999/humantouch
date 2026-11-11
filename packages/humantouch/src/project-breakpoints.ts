/**
 * The project's own breakpoints, from its Tailwind theme (ADR 0008): what the
 * views' ranges line up with, and how the change notes tell the Agent to
 * write them. Read by the local service, from the project's files: Tailwind
 * v4's `@theme` in its CSS, over Tailwind's own theme; Tailwind v3's config,
 * resolved as Tailwind resolves it. A project with no Tailwind has none here:
 * the editor layer reads the media queries of the page's stylesheets instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { lengthInPx, type ProjectBreakpoint, type ProjectBreakpoints } from "./client/breakpoints";

/** Tailwind v4's own breakpoints, should its theme not be found. */
const TAILWIND_4 = "--breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-lg: 64rem; --breakpoint-xl: 80rem; --breakpoint-2xl: 96rem;";
/** Where a project lists Tailwind, when it has it. */
const DEPENDENCIES = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
/** Tailwind v3's config, as a project names it. */
const CONFIGS = ["js", "cjs", "mjs", "ts", "cts", "mts"].map((ext) => `tailwind.config.${ext}`);
/** Folders with no CSS of the project's own. */
const SKIPPED = new Set(["node_modules", "dist", "build", "out", "coverage"]);
/** Enough CSS files for any project; the rest are not looked at. */
const MAX_CSS_FILES = 2000;

/** The project's breakpoints, from its Tailwind theme; null with no Tailwind, or none to be read. */
export async function readProjectBreakpoints(root: string): Promise<ProjectBreakpoints | null> {
  const require = createRequire(join(root, "package.json"));
  let version: string;
  try {
    // Of the project's own dependencies: from its folder, pnpm's NODE_PATH finds any package of a workspace.
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (!DEPENDENCIES.some((field) => manifest[field]?.tailwindcss)) return null;
    version = JSON.parse(readFileSync(require.resolve("tailwindcss/package.json"), "utf8")).version;
  } catch {
    return null;
  }
  try {
    const list = Number(version.split(".")[0]) >= 4 ? await fromTheme(root, require) : fromConfig(root, require);
    return list.length ? { from: "tailwind", list } : null;
  } catch (error) {
    console.warn("Human Touch: could not read the project's Tailwind breakpoints:", error);
    return null;
  }
}

/** Tailwind v4: its own theme's breakpoints, then each `@theme` of the project's CSS. */
async function fromTheme(root: string, require: NodeJS.Require): Promise<ProjectBreakpoint[]> {
  let defaults = TAILWIND_4;
  try {
    defaults = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
  } catch {}
  const screens = new Map<string, number>();
  themeBreakpoints(defaults, screens);
  for (const file of await cssFiles(root)) {
    const css = await readFile(file, "utf8");
    if (css.includes("@theme")) themeBreakpoints(css, screens);
  }
  return byWidth(screens);
}

/** Takes the breakpoints `css` declares in its `@theme` blocks into `screens`, in order: `initial` takes them off. */
function themeBreakpoints(css: string, screens: Map<string, number>) {
  css = css.replace(/\/\*[^]*?\*\//g, "");
  for (const block of themeBlocks(css)) {
    for (const [, name, value] of block.matchAll(/(--[\w*-]+)\s*:\s*([^;{}]*)/g)) {
      const initial = value.trim() === "initial";
      if (initial && (name === "--*" || name === "--breakpoint-*")) screens.clear();
      if (!name.startsWith("--breakpoint-") || name.endsWith("*")) continue;
      const screen = name.slice("--breakpoint-".length);
      const px = initial ? null : lengthInPx(value);
      if (px === null) screens.delete(screen);
      else screens.set(screen, px);
    }
  }
}

/** What each `@theme { … }` in the CSS holds. */
function themeBlocks(css: string): string[] {
  const blocks: string[] = [];
  for (let at = css.indexOf("@theme"); at >= 0; at = css.indexOf("@theme", at + 1)) {
    const open = css.indexOf("{", at);
    if (open < 0) break;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        blocks.push(css.slice(open + 1, i));
        at = i;
        break;
      }
    }
  }
  return blocks;
}

/** The project's own CSS files, in order of their paths. */
async function cssFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_CSS_FILES) return;
      if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".css")) files.push(path);
    }
  };
  await walk(root);
  return files;
}

/** Tailwind v3: the config's screens, resolved as Tailwind does, its own when the project has no config. */
function fromConfig(root: string, require: NodeJS.Require): ProjectBreakpoint[] {
  const resolveConfig = require("tailwindcss/resolveConfig") as (config: object) => { theme: { screens?: Record<string, unknown> } };
  const file = CONFIGS.map((name) => join(root, name)).find((path) => existsSync(path));
  let config: object = { content: [] };
  if (file) {
    const loadConfig = require("tailwindcss/loadConfig") as (path: string) => object & { default?: object };
    // Read afresh: the config may have changed since.
    delete require.cache[file];
    const loaded = loadConfig(file);
    config = loaded.default ?? loaded;
  }
  const screens = new Map<string, number>();
  for (const [name, value] of Object.entries(resolveConfig(config).theme.screens ?? {})) {
    // A screen from a width up: `"768px"` or `{ min: "768px" }`. One with a `max`, or `raw`, stands for no such range.
    const first = Array.isArray(value) ? value[0] : value;
    const min = typeof first === "string" ? first : first && typeof first === "object" && !("max" in first) ? (first as { min?: unknown }).min : null;
    const px = typeof min === "string" ? lengthInPx(min) : null;
    if (px !== null) screens.set(name, px);
  }
  return byWidth(screens);
}

/** Narrowest first, the first named at each width. */
function byWidth(screens: Map<string, number>): ProjectBreakpoint[] {
  const list: ProjectBreakpoint[] = [];
  for (const [name, width] of [...screens].sort(([, a], [, b]) => a - b)) if (width > 0 && list.at(-1)?.width !== width) list.push({ width, name });
  return list;
}
