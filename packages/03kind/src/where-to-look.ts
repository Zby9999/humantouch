/**
 * What the change notes name so that the Agent need not search the project
 * for it (ticket 101): a component's other usages, the project's
 * class-merging helper, and where the page's body text style is set. Read
 * from the project's source as `claim` prints the notes, as it is then.
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { promisify } from "node:util";
import type { Change, Created } from "./client/changeset";
import { forOneUsage } from "./client/checkable";
import { openingTags } from "./source-marker";

/** A helper that puts a layer's classes together: where it is defined (`at`), or the package it comes from (`from`); `merges`: a later class replaces an earlier one that conflicts with it (tailwind-merge), not only joins them. */
export interface ClassHelper {
  name: string;
  at?: string;
  from?: string;
  merges: boolean;
}

/** Where something sets the page's body text style: a rule (`selector`) of a stylesheet, at `file:line`; or, `selector` null, the `className` of the `<body>` JSX, at `file:line:column`. */
export interface BodyTextPlace {
  selector: string | null;
  at: string;
}

export interface WhereToLook {
  /** Each usage in the source of the components the round changes for one usage alone, by component: `file:line:column`, as its usage marker gives it, in the order of the source. */
  usages: Record<string, string[]>;
  /** The project's class-merging helper, or the one it joins classes with; null: it has none. Not given: not looked for. */
  helper?: ClassHelper | null;
  /** What sets the page's body text style; none: nothing in the project's source. Not given: not looked for (no new text this round). */
  bodyText?: BodyTextPlace[];
}

/** A change whose scope is one usage of a component, as the notes say it (This usage only), at a usage they give. */
export function oneUsageGiven(change: Change): boolean {
  return change.scope !== "component" && forOneUsage(change) && !!change.target.chain[0].usage;
}

/** New text: the notes say to give it the page's body text style. */
const isNewText = (change: Change) => change.kind === "create" && (change.after as Created).type === "text";

/** What the notes of `changes` name, read from the project at `root`: nothing in a folder with no `package.json`, which is no project. */
export async function whereToLook(root: string, changes: Change[]): Promise<WhereToLook> {
  const forOne = changes.filter(oneUsageGiven);
  const components = [...new Set(forOne.map((change) => change.target.chain[0].component))];
  const wantsHelper = changes.some((change) => change.scope !== "component" && forOneUsage(change));
  const wantsBody = changes.some(isNewText);
  const look: WhereToLook = { usages: {} };
  if (!components.length && !wantsHelper && !wantsBody) return look;
  const manifest = await read(root, "package.json");
  if (manifest === null) return look;
  const files = await projectFiles(root);
  if (components.length) look.usages = await usagesOf(root, files, components);
  if (wantsHelper) {
    const involved = forOne.flatMap(({ target }) => [target.chain[0].usage, target.loc]).map((place) => place?.replace(/(:\d+)+$/, ""));
    look.helper = await helperOf(root, manifest, [...new Set(involved.filter((file): file is string => !!file))]);
  }
  if (wantsBody) look.bodyText = await bodyTextOf(root, files);
  return look;
}

const JSX = /\.(jsx|tsx|js)$/;
const STYLESHEET = /\.(css|scss|sass|less|pcss)$/;

/** The project's own files, from its folder: what git does not ignore, else all but `node_modules`, hidden and build folders; a package of its own inside it (vendored) left out. */
async function projectFiles(root: string): Promise<string[]> {
  let files: string[];
  try {
    const { stdout } = await promisify(execFile)("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    files = stdout.split("\0").filter(Boolean);
  } catch {
    files = await walk(root, "");
  }
  const packages = files.filter((file) => file.endsWith("/package.json")).map((file) => file.slice(0, -"package.json".length));
  return files.filter((file) => !/(^|\/)node_modules\//.test(file) && !packages.some((dir) => file.startsWith(dir)));
}

async function walk(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "out", "coverage"].includes(entry.name)) continue;
      files.push(...(await walk(root, path)));
    } else if (entry.isFile()) files.push(path);
  }
  return files;
}

const read = (root: string, file: string) => readFile(join(root, file), "utf8").catch(() => null);

/** Each usage of `components` in the JSX `files`: an element opened with its name (or `Something.Name`). */
async function usagesOf(root: string, files: string[], components: string[]): Promise<Record<string, string[]>> {
  const usages: Record<string, string[]> = Object.fromEntries(components.map((component) => [component, []]));
  const named = new RegExp(`<\\s*(?:[\\w$]+\\.)*(${components.map(escape).join("|")})\\b`);
  for (const file of files.filter((file) => JSX.test(file)).sort()) {
    const code = await read(root, file);
    if (!code || !named.test(code)) continue;
    for (const { tag, line, column } of openingTags(code, file) ?? []) {
      const name = tag.split(".").at(-1)!;
      if (name in usages) usages[name].push(`${file}:${line}:${column}`);
    }
  }
  return usages;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names a class-merging helper, or one that only joins classes, goes by. */
const HELPERS = ["cn", "cx", "clsx", "classNames", "classnames", "twMerge", "twJoin"];
/** Packages of such helpers: whether the one each exports merges. */
const HELPER_PACKAGES: Record<string, { name: string; merges: boolean }> = {
  "tailwind-merge": { name: "twMerge", merges: true },
  clsx: { name: "clsx", merges: false },
  classnames: { name: "classNames", merges: false },
};
/** Where projects keep theirs (shadcn/ui's `cn` in `lib/utils`), from the project's folder. */
const KNOWN_PLACES = ["src/lib/utils", "lib/utils", "src/utils", "utils", "src/lib/cn", "lib/cn", "src/utils/cn", "utils/cn", "app/lib/utils"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/**
 * The project's class-merging helper, else the one it joins classes with,
 * found with no search: one the `involved` files import, one where projects
 * keep theirs, or a package of one the project depends on (its `manifest`).
 */
async function helperOf(root: string, manifest: string, involved: string[]): Promise<ClassHelper | null> {
  let deps: string[] = [];
  try {
    const json = JSON.parse(manifest) as { dependencies?: object; devDependencies?: object };
    deps = [...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})];
  } catch {
    // Read as having none.
  }
  const found: ClassHelper[] = [];
  for (const file of involved) {
    const code = await read(root, file);
    for (const { name, source } of code ? helperImports(code) : []) {
      const helper = HELPER_PACKAGES[source] ? { ...HELPER_PACKAGES[source], name, from: source } : await definedIn(root, resolveImport(file, source), name);
      if (helper) found.push(helper);
    }
  }
  for (const place of KNOWN_PLACES) {
    for (const name of HELPERS) {
      const helper = await definedIn(root, [place], name);
      if (helper) found.push(helper);
    }
  }
  for (const [source, helper] of Object.entries(HELPER_PACKAGES)) if (deps.includes(source)) found.push({ ...helper, from: source });
  // One that merges first, the project's own before a package's.
  return found.find((helper) => helper.merges) ?? found[0] ?? null;
}

/** The helpers a module imports by a name such helpers go by: the name it is defined by, and where from. */
function helperImports(code: string): { name: string; source: string }[] {
  const imports: { name: string; source: string }[] = [];
  for (const [, clause, source] of code.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s*["']([^"']+)["']/g)) {
    const named = clause.match(/\{([^}]*)\}/)?.[1].split(",") ?? [];
    const defaultName = clause.replace(/\{[^}]*\}/, "").replace(/[\s,]/g, "");
    for (const one of named) {
      const name = one.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (HELPERS.includes(name)) imports.push({ name, source });
    }
    if (defaultName && HELPERS.includes(defaultName)) imports.push({ name: defaultName, source });
  }
  return imports;
}

/** The files an import of `source` from `file` may be, from the project's folder, without their extensions: `@/` and `~/` from `src/`, or from the folder. */
function resolveImport(file: string, source: string): string[] {
  if (source.startsWith(".")) return [posix.join(posix.dirname(file), source)];
  const alias = source.match(/^[@~]\/(.*)$/)?.[1];
  return alias ? [`src/${alias}`, alias] : [];
}

/** The helper `name` as the module at one of `places` (without an extension, or an index in it) defines it: at the line of its definition, merging when the module uses tailwind-merge. */
async function definedIn(root: string, places: string[], name: string): Promise<ClassHelper | null> {
  for (const place of places) {
    for (const file of [place, ...EXTENSIONS.map((ext) => place + ext), ...EXTENSIONS.map((ext) => `${place}/index${ext}`)]) {
      if (!EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
      const code = await read(root, file);
      if (code === null) continue;
      const definition = new RegExp(`^export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|const\\s+|let\\s+|var\\s+)${escape(name)}\\b`, "m").exec(code);
      if (!definition) continue;
      const line = code.slice(0, definition.index).split("\n").length;
      return { name, at: `${file}:${line}`, merges: /from\s*["']tailwind-merge["']|require\(\s*["']tailwind-merge["']\s*\)/.test(code) };
    }
  }
  return null;
}

/** What sets the page's body text style: the rules on `body` or `html` of the project's stylesheets (CSS Modules aside), and a `className` on the `<body>` JSX. */
async function bodyTextOf(root: string, files: string[]): Promise<BodyTextPlace[]> {
  const places: BodyTextPlace[] = [];
  for (const file of files.filter((file) => STYLESHEET.test(file) && !/\.module\.[a-z]+$/.test(file)).sort()) {
    const css = await read(root, file);
    for (const { selector, line } of css ? bodyRules(css) : []) places.push({ selector, at: `${file}:${line}` });
  }
  for (const file of files.filter((file) => JSX.test(file)).sort()) {
    const code = await read(root, file);
    if (!code?.includes("<body")) continue;
    for (const { tag, line, column, attributes } of openingTags(code, file) ?? []) if (tag === "body" && attributes.includes("className")) places.push({ selector: null, at: `${file}:${line}:${column}` });
  }
  // By file, as the project lists them.
  const fileOf = (place: BodyTextPlace) => place.at.replace(/(:\d+)+$/, "");
  return places.sort((a, b) => (fileOf(a) < fileOf(b) ? -1 : fileOf(a) > fileOf(b) ? 1 : 0));
}

/** A text style a rule sets: its font, color, line height or letter spacing, or Tailwind classes it applies. */
const TEXT_STYLE = /(^|[;{\s])(font(-[a-z-]+)?|color|line-height|letter-spacing)\s*:|@apply\s/;

/** The rules of a stylesheet on `body` or `html` that set a text style, at the line their selector starts. */
export function bodyRules(css: string): { selector: string; line: number }[] {
  // Comments out, every line kept where it is.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const rules: { selector: string; line: number }[] = [];
  for (const match of text.matchAll(/([^{};]*)\{/g)) {
    const parts = match[1].split(",").map((part) => part.trim());
    if (match[1].trim().startsWith("@") || !parts.some((part) => part === "body" || part === "html")) continue;
    const start = match.index! + match[0].length;
    const end = text.slice(start).search(/[{}]/);
    if (!TEXT_STYLE.test(text.slice(start, end < 0 ? undefined : start + end))) continue;
    const at = match.index! + match[1].search(/\S/);
    rules.push({ selector: parts.join(", "), line: text.slice(0, at).split("\n").length });
  }
  return rules;
}
