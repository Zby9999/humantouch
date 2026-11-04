import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommand, devCommand, STARTS } from "./install-starts.ts";

test("there are ten starts, each with its own id", () => {
  assert.equal(STARTS.length, 10);
  assert.equal(new Set(STARTS.map((start) => start.id)).size, 10);
});

test("the starts cover every kind of project ticket 24 lists", () => {
  const has = (match: (start: (typeof STARTS)[number]) => boolean) => STARTS.some(match);
  assert.ok(has((s) => s.framework === "vite" && s.language === "ts"), "Vite + React, TypeScript");
  assert.ok(has((s) => s.framework === "vite" && s.language === "js"), "Vite + React, JavaScript");
  assert.ok(has((s) => s.bundler === "turbopack"), "Next.js on Turbopack");
  assert.ok(has((s) => s.bundler === "webpack"), "Next.js on webpack");
  assert.ok(has((s) => s.framework === "next" && s.srcDir), "Next.js with src/");
  assert.ok(has((s) => s.framework === "next" && !s.srcDir), "Next.js without src/");
  for (const pm of ["npm", "pnpm", "yarn", "bun"]) assert.ok(has((s) => s.packageManager === pm), pm);
  for (const styles of ["tailwind4", "tailwind3", "css-modules", "css"]) assert.ok(has((s) => s.styles === styles), styles);
  assert.ok(has((s) => s.react === 18), "React 18");
});

test("each start agrees with itself", () => {
  for (const start of STARTS) {
    assert.equal(start.port, start.framework === "vite" ? 5173 : 3000, start.id);
    assert.equal(start.bundler === "vite", start.framework === "vite", start.id);
    if (start.framework === "vite") assert.ok(start.srcDir, `${start.id}: Vite's code is under src/`);
    // CSS Modules come with create-next-app; create-vite gives plain CSS.
    if (start.styles === "css-modules") assert.equal(start.framework, "next", start.id);
    if (start.styles === "css") assert.equal(start.framework, "vite", start.id);
    if (start.react === 18) assert.equal(start.framework, "vite", `${start.id}: Next.js 16 needs React 19`);
  }
});

test("each scaffold runs by the start's own package manager and asks nothing", () => {
  for (const start of STARTS) {
    const command = createCommand(start, "1.2.3");
    assert.equal(command[0], start.packageManager, start.id);
    assert.equal(command[1], "create", start.id);
    assert.ok(command.includes(start.id), start.id);
    if (start.framework === "vite") {
      assert.ok(command.includes("--no-interactive") && command.includes("--no-immediate"), start.id);
    } else {
      assert.ok(command.includes("--yes") && command.includes(`--use-${start.packageManager}`), start.id);
      assert.ok(command.includes(start.srcDir ? "--src-dir" : "--no-src-dir"), start.id);
      assert.ok(command.includes(start.styles === "tailwind4" ? "--tailwind" : "--no-tailwind"), start.id);
    }
    assert.ok(!command.some((arg) => /open/.test(arg)), `${start.id}: nothing opens a window`);
  }
});

test("the scaffold's version is pinned, but for yarn 1, whose create takes none", () => {
  const command = (id: string) => createCommand(STARTS.find((start) => start.id === id)!, "9.3.3");
  assert.deepEqual(command("vite-ts-npm-css").slice(0, 4), ["npm", "create", "--yes", "vite@9.3.3"]);
  assert.deepEqual(command("vite-ts-bun-css").slice(0, 3), ["bun", "create", "vite@9.3.3"]);
  assert.deepEqual(command("vite-ts-yarn-tw3").slice(0, 3), ["yarn", "create", "vite"]);
  assert.deepEqual(command("next-turbo-pnpm-tw3").slice(0, 3), ["pnpm", "create", "next-app@9.3.3"]);
});

test("dev runs the project's own script", () => {
  assert.deepEqual(devCommand("npm"), ["npm", "run", "dev"]);
  assert.deepEqual(devCommand("bun"), ["bun", "run", "dev"]);
  assert.deepEqual(devCommand("pnpm"), ["pnpm", "dev"]);
  assert.deepEqual(devCommand("yarn"), ["yarn", "dev"]);
});
