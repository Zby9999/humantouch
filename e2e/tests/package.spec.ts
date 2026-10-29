import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";
import { pack, sh } from "./install-copy";

/** The package as it would be published, packed and unpacked into a folder of its own. */
let dir: string;
/** Its files, relative to the package. */
let files: string[];
let pkg: {
  private?: boolean;
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  dir = mkdtempSync(join(tmpdir(), "vernierkit-pack-"));
  const packed = await pack(dir);
  await sh("tar", ["-xzf", packed], dir);
  const root = join(dir, "package");
  files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1));
  pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
});

test.afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("the package can be published: not private, and none of its dependencies is the workspace's", () => {
  expect(pkg.private).toBeFalsy();
  const ranges = Object.values({ ...pkg.dependencies, ...pkg.peerDependencies });
  expect(ranges.filter((range) => range.startsWith("workspace:"))).toEqual([]);
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

test("every module the built code imports from beside it is in the package: the shared chunk, and the editor layer loaded once edit mode is entered", () => {
  // The ES modules: the CommonJS ones are bundled whole, with code that only reads like an import in them.
  const imported = files
    .filter((file) => file.endsWith(".js"))
    .flatMap((file) => {
      const code = readFileSync(join(dir, "package", file), "utf8");
      return [...code.matchAll(/(?:from|import\()\s*["'](\.\.?\/[^"']+)["']/g)].map((match) => join(dirname(file), match[1]));
    });
  expect(imported).toContain("dist/editor.dev.js");
  for (const file of imported) expect(files, file).toContain(file);
});

test("the package has nothing but what is built and the Skill: no example project, test, fixture or source", () => {
  // Beside the files npm always packs.
  const others = files.filter((file) => !/^(dist|skill)\//.test(file));
  expect(others.filter((file) => !["package.json", "README.md", "LICENSE"].includes(file))).toEqual([]);
  // Nor in what is built.
  expect(files.filter((file) => /fixtures|\.(test|spec)\.|\.tsx?$/.test(file) && !file.endsWith(".d.ts") && !file.endsWith(".d.cts"))).toEqual([]);
});

test("the package has no source map, nor code pointing to one: a project's dev server has none to warn is missing", () => {
  expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
  const pointing = files
    .filter((file) => /\.c?js$/.test(file))
    .filter((file) => /[#@] sourceMappingURL=/.test(readFileSync(join(dir, "package", file), "utf8")));
  expect(pointing).toEqual([]);
});
