import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "vite";
import { afterAll, describe, expect, test } from "vitest";
import humanTouch from "../src/vite";
import { updatesInTurn } from "../src/vite-version";

describe("whether Vite handles its updates one at a time (ticket 125)", () => {
  test("from 6.3.0 on", () => {
    for (const v of ["6.3.0", "6.3.1", "6.4.3", "7.0.0", "8.3.4", "10.0.0-beta.1"]) expect(updatesInTurn(v), v).toBe(true);
  });

  test("not before 6.3.0, nor in 6.3.0's prereleases", () => {
    for (const v of ["4.5.3", "5.0.0", "5.4.11", "6.0.0", "6.2.7", "6.3.0-beta.2"]) expect(updatesInTurn(v), v).toBe(false);
  });

  test("a version it cannot read is taken as not", () => {
    for (const v of [undefined, "", "latest", "6.x"]) expect(updatesInTurn(v), String(v)).toBe(false);
  });
});

describe("the plugin tells the page whether the Vite serving it handles its updates in turn (ticket 125)", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A project at a root of its own, with a `vite` of `version` in its `node_modules`. */
  const projectWithVite = (version: string) => {
    const root = mkdtempSync(join(tmpdir(), "03kind-vite-version-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "project", private: true }));
    mkdirSync(join(root, "node_modules", "vite"), { recursive: true });
    writeFileSync(join(root, "node_modules", "vite", "package.json"), JSON.stringify({ name: "vite", version }));
    return root;
  };

  /** What the plugin's code-updates module says, its config resolved at `root` as Vite's `this` gives it. */
  const codeUpdatesAt = async (root: string, context: object = {}) => {
    const plugin = humanTouch();
    await (plugin.configResolved as (this: object, config: ResolvedConfig) => Promise<void>).call(context, { root, base: "/" } as ResolvedConfig);
    return (plugin.load as (id: string) => string | undefined).call({}, "\0virtual:03kind/code-updates");
  };

  test("the Vite the project resolves, not humantouch's: 5.4.11 there, not in turn", async () => {
    expect(await codeUpdatesAt(projectWithVite("5.4.11"))).toContain("inTurn: false");
  });

  test("the Vite the project resolves: 8.3.4, in this package, in turn", async () => {
    expect(await codeUpdatesAt(join(import.meta.dirname, ".."))).toContain("inTurn: true");
  });

  test("the version Vite 7 on tells its plugins comes first", async () => {
    expect(await codeUpdatesAt(projectWithVite("5.4.11"), { meta: { viteVersion: "7.1.0" } })).toContain("inTurn: true");
  });
});
