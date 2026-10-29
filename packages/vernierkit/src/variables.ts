/**
 * Reading the project's Variables, in the local service: its CSS custom
 * properties, its Tailwind v4 theme (`@theme` and Tailwind's default theme)
 * and its Tailwind v3 config (resolved by the project's own Tailwind). Each is
 * put in one of the Design panel's groups, by its namespace or name, else by
 * its value; the project's own come before Tailwind's defaults. Whatever
 * cannot be read is left out: a project with none has none.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Variable, VariableGroup } from "./service-protocol";

/** Folders that hold no styles of the project's own. */
const SKIPPED = new Set(["node_modules", "dist", "build", "out", "coverage"]);
const MAX_DEPTH = 8;
const MAX_FILES = 300;
const MAX_SIZE = 512 * 1024;

/** Tailwind's spacing steps, as its classes name them (`p-0.5`, `gap-4`). */
const SPACING_STEPS = ["0", "px", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96"];

/** Tailwind v4's namespaces, by group. A font size's own settings (`--text-xs--line-height`) are none. */
const NAMESPACES: [VariableGroup, RegExp][] = [
  ["color", /^--color-(.+)$/],
  ["spacing", /^--spacing-(.+)$/],
  ["radius", /^--radius-(.+)$/],
  ["fontSize", /^--text-(?!.*--)(.+)$/],
  ["shadow", /^--shadow-(.+)$/],
];

/** Tailwind v3's theme keys, by group. */
const THEME_KEYS: [VariableGroup, string][] = [
  ["color", "colors"],
  ["spacing", "spacing"],
  ["radius", "borderRadius"],
  ["fontSize", "fontSize"],
  ["shadow", "boxShadow"],
];

/** What a CSS variable's name says of its group, first hint first. */
const HINTS: [VariableGroup, RegExp][] = [
  ["shadow", /shadow/i],
  ["radius", /radius|rounded/i],
  ["color", /colou?r/i],
  ["spacing", /space|spacing/i],
  ["fontSize", /font|text|size/i],
];

export async function readVariables(root: string): Promise<Variable[]> {
  try {
    return await read(root);
  } catch (error) {
    console.warn("Vernier Kit: could not read the project's Variables:", error);
    return [];
  }
}

async function read(root: string): Promise<Variable[]> {
  if (!existsSync(root)) return [];
  const sheets = (await cssFiles(root)).map(withoutComments);
  const own = { theme: new Map<string, string>(), cleared: [] as string[], custom: new Map<string, string>() };
  for (const sheet of sheets) readSheet(sheet, own);

  const tailwind = tailwindOf(root);
  const variables: Variable[] = [];
  let lookup = new Map([...own.custom, ...own.theme]);

  if (tailwind?.major === 4 && sheets.some((sheet) => /@import\s+["']tailwindcss(\/theme(\.css)?)?["']/.test(sheet))) {
    const defaults = new Map<string, string>();
    const theme = await readFile(join(tailwind.dir, "theme.css"), "utf8").catch(() => "");
    readSheet(withoutComments(theme), { theme: defaults, cleared: [], custom: new Map() });
    for (const name of defaults.keys()) if (own.cleared.some((prefix) => name.startsWith(prefix))) defaults.delete(name);
    lookup = new Map([...own.custom, ...defaults, ...own.theme]);
    const entries = [...[...own.theme].map(([name, value]) => [name, value, true] as const), ...[...defaults].filter(([name]) => !own.theme.has(name)).map(([name, value]) => [name, value, false] as const)];
    for (const [name, raw, isOwn] of entries) {
      const value = substitute(raw, lookup);
      if (value === null) continue;
      if (name === "--spacing") {
        for (const step of SPACING_STEPS) {
          const css = step === "px" ? "1px" : `calc(var(--spacing) * ${step})`;
          variables.push({ name: step, group: "spacing", value: step === "px" ? "1px" : `calc(${value} * ${step})`, from: "tailwind", css, own: isOwn });
        }
        continue;
      }
      const spaced = NAMESPACES.find(([, pattern]) => pattern.test(name));
      if (!spaced || !fits(spaced[0], value)) continue;
      variables.push({ name: spaced[1].exec(name)![1], group: spaced[0], value, from: "tailwind", css: `var(${name})`, own: isOwn });
    }
  } else if (tailwind?.major === 3) {
    variables.push(...(await tailwindV3(root, tailwind.require, lookup)));
  }

  for (const [name, raw] of own.custom) {
    const value = substitute(raw, lookup);
    const group = value === null ? null : groupOf(name, value);
    if (group) variables.push({ name, group, value: value!, from: "css", css: `var(${name})`, own: true });
  }
  // The project's own first, each in the order it is defined in.
  return [...variables.filter((v) => v.own), ...variables.filter((v) => !v.own)];
}

/** The project's stylesheets, outside dependencies and build output. */
async function cssFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= MAX_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !entry.name.startsWith(".") && !SKIPPED.has(entry.name)) await walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".css") && (await stat(path)).size <= MAX_SIZE) {
        found.push(await readFile(path, "utf8"));
      }
    }
  };
  await walk(root, 0);
  return found;
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The custom properties a stylesheet declares: in its `@theme` blocks (and the
 * namespaces they clear, `--color-*: initial`), and elsewhere. The first
 * declaration of a name is the one kept: `:root` comes before `.dark`.
 */
function readSheet(css: string, into: { theme: Map<string, string>; cleared: string[]; custom: Map<string, string> }) {
  let rest = "";
  let at = 0;
  for (const match of css.matchAll(/@theme\b([^{;]*)\{/g)) {
    if (match.index < at) continue;
    const open = match.index + match[0].length;
    const close = closing(css, open);
    rest += css.slice(at, match.index);
    at = close + 1;
    // `reference`: there for Tailwind to look up, not a theme of the page.
    if (/\breference\b/.test(match[1])) continue;
    for (const [name, value] of declarations(css.slice(open, close))) {
      if (name.endsWith("-*")) {
        if (value === "initial") into.cleared.push(name.slice(0, -1));
      } else into.theme.set(name, value);
    }
  }
  rest += css.slice(at);
  for (const [name, value] of declarations(rest)) if (!into.custom.has(name)) into.custom.set(name, value);
}

/** Where the block opened at `open` closes. */
function closing(css: string, open: number): number {
  let depth = 1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  return css.length;
}

function declarations(css: string): [string, string][] {
  return [...css.matchAll(/(--[\w-]+(?:-\*)?)\s*:\s*([^;{}]+?)\s*(?=;|}|$)/g)].map((m) => [m[1], m[2].replace(/\s+/g, " ")]);
}

/** The value with each `var()` in it replaced by what it refers to; null when one refers to nothing known. */
function substitute(value: string, lookup: Map<string, string>, depth = 0): string | null {
  if (depth > 10 || value.includes("--theme(")) return null;
  const start = value.indexOf("var(");
  if (start < 0) return value;
  let end = start + 4;
  for (let level = 1; end < value.length && level; end++) {
    if (value[end] === "(") level++;
    else if (value[end] === ")") level--;
  }
  const inner = value.slice(start + 4, end - 1);
  const comma = inner.indexOf(",");
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const known = lookup.get(name);
  const replacement = known !== undefined ? substitute(known, lookup, depth + 1) : comma < 0 ? null : substitute(inner.slice(comma + 1).trim(), lookup, depth + 1);
  if (replacement === null) return null;
  return substitute(value.slice(0, start) + replacement + value.slice(end), lookup, depth + 1);
}

/** The Tailwind the project has installed: its major version, where it is, and how to load its modules. */
function tailwindOf(root: string): { major: number; dir: string; require: NodeJS.Require } | null {
  try {
    const require = createRequire(join(root, "package.json"));
    const manifest = require.resolve("tailwindcss/package.json");
    const { version } = require(manifest) as { version: string };
    return { major: Number(version.split(".")[0]), dir: dirname(manifest), require };
  } catch {
    return null;
  }
}

const V3_CONFIGS = ["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts", "tailwind.config.cts", "tailwind.config.mts"];

type Theme = Record<string, unknown>;

/** The theme of a Tailwind v3 config, resolved by the project's own Tailwind; its own values are those Tailwind's defaults do not have. */
async function tailwindV3(root: string, require: NodeJS.Require, lookup: Map<string, string>): Promise<Variable[]> {
  const file = V3_CONFIGS.map((name) => join(root, name)).find((path) => existsSync(path));
  if (!file) return [];
  const resolveConfig = require("tailwindcss/resolveConfig") as (config: object) => { theme: Theme };
  let config: object;
  try {
    config = (require("tailwindcss/loadConfig") as (path: string) => object)(file);
  } catch {
    const loaded = (await import(pathToFileURL(file).href)) as { default?: object };
    config = loaded.default ?? loaded;
  }
  const theme = resolveConfig(config).theme;
  const defaults = resolveConfig({ content: [] }).theme;
  const variables: Variable[] = [];
  for (const [group, key] of THEME_KEYS) {
    const all = flatten(theme[key]);
    const tailwinds = flatten(defaults[key]);
    for (const [name, raw] of all) {
      const value = (Array.isArray(raw) ? raw[0] : raw) as unknown;
      if (typeof value !== "string") continue;
      // A theme value made of the project's CSS variables (`hsl(var(--primary))`) has their values.
      const css = substitute(value.replace(/<alpha-value>/g, "1"), lookup);
      if (css === null || !fits(group, css)) continue;
      const fallback = tailwinds.get(name);
      variables.push({ name, group, value: css, from: "tailwind", own: JSON.stringify(fallback) !== JSON.stringify(raw) });
    }
  }
  return variables;
}

/** A theme section's values by their class names: nested colors joined by `-`, `DEFAULT` the name above it. */
function flatten(section: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!section || typeof section !== "object" || Array.isArray(section)) return out;
  for (const [key, value] of Object.entries(section)) {
    const name = key === "DEFAULT" && prefix ? prefix : prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) for (const [k, v] of flatten(value, name)) out.set(k, v);
    else out.set(name, value);
  }
  return out;
}

/** A CSS variable's group: the first its name hints at that its value fits, else the one its value fits; null for none. */
function groupOf(name: string, value: string): VariableGroup | null {
  const hinted = HINTS.find(([group, hint]) => hint.test(name) && fits(group, value));
  if (hinted) return hinted[0];
  if (isColor(value)) return "color";
  if (isShadow(value)) return "shadow";
  return isLength(value) ? "spacing" : null;
}

/** Whether a value can be one of the group's. */
function fits(group: VariableGroup, value: string): boolean {
  if (group === "color") return isColor(value);
  if (group === "shadow") return isShadow(value);
  return isLength(value);
}

const NAMED_COLORS = new Set(
  (
    "transparent aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral " +
    "cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred " +
    "darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite " +
    "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen " +
    "lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon " +
    "sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen"
  ).split(" "),
);

function isColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) || /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)$/.test(v) || NAMED_COLORS.has(v);
}

/** A length in px or rem, or a sum of them (`calc()`, `min()`…): what can be compared with a size in px. */
function isLength(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (/^-?(\d*\.)?\d+(px|rem)$/.test(v) || v === "0") return true;
  if (!/^(calc|min|max|clamp)\(/.test(v) || /[^\d.\s+\-*/(),a-z]/.test(v)) return false;
  const units = v.replace(/^(calc|min|max|clamp)\(/, "").replace(/\b(calc|min|max|clamp)\(/g, "(").match(/[a-z]+/g) ?? [];
  return units.every((unit) => unit === "px" || unit === "rem");
}

/** One or more shadows: each two to four lengths, a color if any, and `inset` if inner. */
function isShadow(value: string): boolean {
  if (value.trim() === "none") return false;
  return topLevel(value, ",").every((one) => {
    const tokens = topLevel(one.trim(), " ").filter(Boolean);
    const lengths = tokens.filter((token) => /^-?(\d*\.)?\d+(px|rem)?$/.test(token));
    const rest = tokens.filter((token) => !lengths.includes(token) && token !== "inset");
    return lengths.length >= 2 && lengths.length <= 4 && rest.length <= 1 && rest.every(isColor);
  });
}

/** Splits by `separator` outside parentheses. */
function topLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const c of value) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === separator && depth === 0) {
      parts.push(part);
      part = "";
    } else part += c;
  }
  return [...parts, part];
}
