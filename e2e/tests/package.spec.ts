import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";
import { pack, sh } from "./install-copy";

// Packed once for the file: under `fullyParallel`, each worker would pack it again. The checks stay
// independent: one failing does not skip the rest.
test.describe.configure({ mode: "default" });

/** The folder `pnpm pack`'s tarball is unpacked into; the package is in its `package/`. */
let unpacked: string;
/** Its files, relative to the package. */
let files: string[];
let pkg: {
  name: string;
  private?: boolean;
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** A file of the package, as text. */
const read = (file: string) => readFileSync(join(unpacked, "package", file), "utf8");

test.beforeAll(async () => {
  test.setTimeout(120_000);
  unpacked = mkdtempSync(join(tmpdir(), "03kind-pack-"));
  const packed = await pack(unpacked);
  await sh("tar", ["-xzf", packed], unpacked);
  const root = join(unpacked, "package");
  files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1));
  pkg = JSON.parse(read("package.json"));
});

test.afterAll(() => {
  if (unpacked) rmSync(unpacked, { recursive: true, force: true });
});

/** A version, with `x` or `*` for any part, a prerelease and build metadata. */
const VERSION = String.raw`v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const COMPARATOR = new RegExp(`^(?:[~^]|[<>]=?|=)?${VERSION}$`);
const HYPHEN = new RegExp(`^${VERSION}\\s+-\\s+${VERSION}$`);
/** A semver range, as the registry resolves it: not a `workspace:`, `file:`, `link:`, git or URL source, nor a dist-tag. */
const isSemverRange = (range: string) =>
  range.split("||").every((set) => {
    const comparators = set.trim();
    return comparators === "" || HYPHEN.test(comparators) || comparators.split(/\s+/).every((comparator) => COMPARATOR.test(comparator));
  });

test("the package can be published: not private, and each of its dependencies a semver range the registry resolves", () => {
  expect(pkg.private).toBeFalsy();
  const ranges = Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies });
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges.filter(([, range]) => !isSemverRange(range))).toEqual([]);
});

test("the package has every file its exports and its command line point to, and the Skill init copies", () => {
  const targets = [
    ...Object.values(pkg.bin),
    ...Object.values(pkg.exports).flatMap((entry) => (typeof entry === "string" ? [entry] : Object.values(entry))),
  ].map((target) => target.replace(/^\.\//, ""));
  expect(targets).toContain("dist/cli.js");
  for (const target of targets) expect(files, target).toContain(target);
  expect(files).toContain("skill/SKILL.md");
});

/**
 * What each built module imports or requires, by file: `import … from`, `import "…"` and `import("…")` in the
 * ES modules, `require("…")` in the CommonJS ones (bundled with code that only reads like an import, in strings).
 */
const specifiers = () =>
  files
    .filter((file) => /\.c?js$/.test(file))
    .flatMap((file) => {
      const pattern = file.endsWith(".cjs") ? /\brequire\(\s*["']([^"'\s]+)["']\s*\)/g : /(?:\bfrom|\bimport\s*\(?)\s*["']([^"'\s]+)["']/g;
      return [...read(file).matchAll(pattern)].map((match) => ({ file, specifier: match[1] }));
    });
const isRelative = (specifier: string) => /^\.\.?\//.test(specifier);

test("every module the built code imports from beside it is in the package: the shared chunk, and the editor layer loaded once edit mode is entered", () => {
  const imported = specifiers()
    .filter(({ specifier }) => isRelative(specifier))
    .map(({ file, specifier }) => join(dirname(file), specifier));
  expect(imported).toContain("dist/editor.dev.js");
  for (const file of imported) expect(files, file).toContain(file);
});

test("every package the built code imports is one it declares: a project installing it gets them all", () => {
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
  // The bundler writes Node's own modules without `node:`.
  const packages = specifiers().filter(({ specifier }) => !isRelative(specifier) && !builtinModules.includes(specifier.replace(/^node:/, "")));
  expect(packages.map(({ specifier }) => specifier)).toContain("@babel/parser");
  const undeclared = packages.filter(({ specifier }) => {
    const name = /^(?:@[^/]+\/)?[^/]+/.exec(specifier)?.[0] ?? specifier;
    // Its own name, it imports through its exports.
    if (name === pkg.name) return !(`.${specifier.slice(name.length)}` in pkg.exports);
    return !declared.includes(name);
  });
  expect(undeclared).toEqual([]);
});

test("the package has nothing but what is built and the Skill: no example project, test, fixture or source", () => {
  // Beside what npm always packs, whatever `files` says: package.json, and a README, COPYING, LICENSE or LICENCE
  // at the root, with any extension and in any case.
  const others = files.filter((file) => !/^(dist|skill)\//.test(file));
  expect(others.filter((file) => !/^(package\.json|(readme|copying|license|licence)(\.[^/]*[^~$/])?)$/i.test(file))).toEqual([]);
  // Nor in what is built.
  expect(files.filter((file) => /fixtures|\.(test|spec)\.|\.tsx?$/.test(file) && !file.endsWith(".d.ts"))).toEqual([]);
});

test("the package has no source map, nor code pointing to one: a project's dev server has none to warn is missing", () => {
  expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
  expect(files.filter((file) => /\.c?js$/.test(file)).filter((file) => /[#@] sourceMappingURL=/.test(read(file)))).toEqual([]);
});
