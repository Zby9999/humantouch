/**
 * The project an Agent applies a round in: a copy of the Vite + React 19 +
 * Tailwind v4 example in the system's temporary folder, with Vernier Kit
 * installed by `init` from the package as it would be published, and
 * committed. Each run gets a clone of it of its own, so no run sees another's
 * code, and the Agent never works in this repository.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI, copyWithoutVernier, pack, replaceIn, sh, startServer } from "../tests/install-copy.ts";

const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));
const COMMIT = ["-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-qm"];

/** Where `init` puts the Skill, and the line of AGENTS.md that points to it. */
const SKILL_FOLDERS = [".agents/skills/vernierkit", ".claude/skills/vernierkit"];
const SKILL_LINE = /^Vernier Kit: .*skills\/vernierkit\/SKILL\.md`\.\n/m;

/**
 * Takes out of the project in `dir` what `init` put there for the Agent to
 * find the Skill by: the Skill, its folders when left empty, and its line in
 * AGENTS.md (the file too, when that was all of it). The package keeps its own copy.
 */
export function withoutSkill(dir: string) {
  for (const folder of SKILL_FOLDERS) {
    rmSync(join(dir, folder), { recursive: true, force: true });
    for (let parent = dirname(folder); parent !== "."; parent = dirname(parent)) {
      if (existsSync(join(dir, parent)) && !readdirSync(join(dir, parent)).length) rmSync(join(dir, parent), { recursive: true });
    }
  }
  const agents = join(dir, "AGENTS.md");
  if (!existsSync(agents)) return;
  const text = readFileSync(agents, "utf8").replace(SKILL_LINE, "");
  if (text.trim()) writeFileSync(agents, text);
  else rmSync(agents);
}

/**
 * The project every run starts from, in a folder of its own beside the
 * package it installs: Vernier Kit installed by `init`, committed. With
 * `skill: false`, the Skill is taken out before the commit, so it is in none
 * of the project's history either.
 */
export async function prepareBase({ skill = true } = {}): Promise<{ base: string; remove(): void }> {
  const packed = await pack(mkdtempSync(join(tmpdir(), "vernierkit-bench-pack-")));
  const base = await copyWithoutVernier(EXAMPLE, (dir) => {
    replaceIn(dir, "vite.config.ts", 'import vernier from "vernierkit/vite";\n');
    replaceIn(dir, "vite.config.ts", "vernier(), ");
    replaceIn(dir, "src/App.tsx", 'import { Vernier } from "vernierkit/react";\n');
    replaceIn(dir, "src/App.tsx", "      <Vernier />\n");
  });
  await sh(process.execPath, [CLI, "init"], base, { VERNIERKIT_INSTALL_FROM: packed });
  if (!skill) withoutSkill(base);
  await sh("git", ["add", "-A"], base);
  await sh("git", [...COMMIT, "With Vernier Kit"], base);
  return {
    base,
    remove() {
      rmSync(base, { recursive: true, force: true });
      rmSync(join(packed, ".."), { recursive: true, force: true });
    },
  };
}

export interface RunProject {
  dir: string;
  /** Runs the project's own `npx vernierkit …`. */
  cli(...args: string[]): Promise<string>;
  edit(file: string, from: string, to: string): Promise<void>;
  /** Commits what is in the project now: the code the round starts from. */
  settle(message: string): Promise<void>;
  /** The code the round starts from, as a commit. */
  head(): Promise<string>;
  /** The round's ChangeSet, or null. */
  changeSet(): { changes: any[] } | null;
  remove(): void;
}

/**
 * A clone of the base, its dependencies linked from the store, in the
 * system's temporary folder (beside the base, so the package's relative path
 * holds). `.cursor/` is kept out of git: the bench writes Cursor's
 * permissions there.
 */
export async function cloneBase(base: string): Promise<RunProject> {
  const dir = mkdtempSync(join(tmpdir(), "vernierkit-bench-run-"));
  await sh("git", ["clone", "-q", base, dir], tmpdir());
  writeFileSync(join(dir, ".git/info/exclude"), ".cursor/\n");
  await sh("pnpm", ["install", "--offline", "--frozen-lockfile"], dir);
  const read = (file: string) => {
    try {
      return readFileSync(join(dir, file), "utf8");
    } catch {
      return null;
    }
  };
  return {
    dir,
    cli: (...args) => sh(process.execPath, [join(dir, "node_modules/vernierkit/dist/cli.js"), ...args], dir),
    edit: async (file, from, to) => replaceIn(dir, file, from, to),
    settle: async (message) => {
      await sh("git", ["add", "-A"], dir);
      await sh("git", [...COMMIT, message], dir);
    },
    head: async () => (await sh("git", ["rev-parse", "HEAD"], dir)).trim(),
    changeSet: () => {
      const text = read(".vernier/changeset.json");
      return text === null ? null : JSON.parse(text);
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** The project's dev server on `port`, once it answers. */
export async function startDevServer(dir: string, port: number): Promise<{ url: string; stop(): void }> {
  const server = startServer(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(port), "--strictPort"], dir);
  const url = `http://localhost:${port}`;
  for (const until = Date.now() + 30_000; ; ) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => server.stop() };
    } catch {
      // Not up yet.
    }
    if (Date.now() > until || server.exitCode !== null) {
      server.stop();
      throw new Error(`The dev server did not start on port ${port}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
