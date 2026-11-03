/**
 * The project an Agent applies a round in: a copy of one of the examples
 * (the Vite + React 19 + Tailwind v4 one, unless the scenario names another)
 * in the system's temporary folder, with 03Kind installed by `init` from the
 * package as it would be published, and committed. Each run gets a clone of
 * it of its own, so no run sees another's code, and the Agent never works in
 * this repository.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI, copyWithoutThirdKind, pack, replaceIn, sh, startServer } from "../tests/install-copy.ts";
import type { Example } from "./scenarios.ts";

const exampleFolder = (example: Example) => fileURLToPath(new URL(`../../examples/${example}/`, import.meta.url));

/**
 * Takes out of a copy of each example what the repository wires 03Kind in
 * by, by hand, so `init` can put it in as it would in any project: the build
 * plugin and the editor layer's mount.
 */
const HAND_WIRED: Record<Example, (dir: string) => void> = {
  "vite-react19-tw4": (dir) => {
    replaceIn(dir, "vite.config.ts", 'import thirdKind from "03kind/vite";\n');
    replaceIn(dir, "vite.config.ts", "thirdKind(), ");
    replaceIn(dir, "src/App.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "src/App.tsx", "      <ThirdKind />\n");
  },
  "vite-react18-tw3": (dir) => {
    replaceIn(dir, "vite.config.ts", 'import thirdKind from "03kind/vite";\n');
    replaceIn(dir, "vite.config.ts", "thirdKind(), ");
    replaceIn(dir, "src/App.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "src/App.tsx", "      <ThirdKind />\n");
    // Its big page, for the performance tests, mounts the editor layer too: `init` would see it mounted there, and leave App be.
    replaceIn(dir, "src/big/BigPage.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "src/big/BigPage.tsx", "      <ThirdKind />\n");
  },
  // As `next-install.spec.ts` takes it out.
  "next-app-css-modules": (dir) => {
    replaceIn(dir, "next.config.ts", 'import { withThirdKind } from "03kind/next";\n');
    replaceIn(dir, "next.config.ts", "withThirdKind(nextConfig)", "nextConfig");
    replaceIn(dir, "app/layout.tsx", 'import { ThirdKind } from "03kind/react";\n');
    replaceIn(dir, "app/layout.tsx", "        <ThirdKind />\n");
  },
};
const COMMIT = ["-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-qm"];

/** Where `init` puts the Skill, and the line of AGENTS.md that points to it. */
const SKILL_FOLDERS = [".agents/skills/03kind", ".claude/skills/03kind"];
const SKILL_LINE = /^03Kind: .*skills\/03kind\/SKILL\.md`\.\n/m;

/**
 * Takes out of the project in `dir` what `init` put there for the Agent to
 * find the Skill by: the Skill, its folders when left empty, and its line in
 * AGENTS.md (the file too, when that was all of it), and that line in what
 * `init` recorded in `.03kind/install.json`. The package keeps its own copy.
 */
export function withoutSkill(dir: string) {
  for (const folder of SKILL_FOLDERS) {
    rmSync(join(dir, folder), { recursive: true, force: true });
    for (let parent = dirname(folder); parent !== "."; parent = dirname(parent)) {
      if (existsSync(join(dir, parent)) && !readdirSync(join(dir, parent)).length) rmSync(join(dir, parent), { recursive: true });
    }
  }
  // What `init` recorded of that line goes too: `doctor` and `remove` find nothing of it to stand on (ticket 63).
  const record = join(dir, ".03kind/install.json");
  if (existsSync(record)) {
    const installed = JSON.parse(readFileSync(record, "utf8"));
    installed.edits = installed.edits.filter((edit: { file: string }) => edit.file !== "AGENTS.md");
    installed.created = installed.created.filter((file: string) => file !== "AGENTS.md");
    writeFileSync(record, `${JSON.stringify(installed, null, 2)}\n`);
  }
  const agents = join(dir, "AGENTS.md");
  if (!existsSync(agents)) return;
  const text = readFileSync(agents, "utf8").replace(SKILL_LINE, "");
  if (text.trim()) writeFileSync(agents, text);
  else rmSync(agents);
}

/**
 * The project every run on `example` starts from, in a folder of its own
 * beside the package it installs: 03Kind installed by `init`, committed. With
 * `skill: false`, the Skill is taken out before the commit, so it is in none
 * of the project's history either.
 */
export async function prepareBase({ skill = true, example = "vite-react19-tw4" }: { skill?: boolean; example?: Example } = {}): Promise<{ base: string; remove(): void }> {
  const packed = await pack(mkdtempSync(join(tmpdir(), "03kind-bench-pack-")));
  const base = await copyWithoutThirdKind(exampleFolder(example), HAND_WIRED[example]);
  await sh(process.execPath, [CLI, "init"], base, { TK_INSTALL_FROM: packed });
  if (!skill) withoutSkill(base);
  await sh("git", ["add", "-A"], base);
  await sh("git", [...COMMIT, "With 03Kind"], base);
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
  /** Runs the project's own `npx 03kind …`. */
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
  const dir = mkdtempSync(join(tmpdir(), "03kind-bench-run-"));
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
    cli: (...args) => sh(process.execPath, [join(dir, "node_modules/03kind/dist/cli.js"), ...args], dir),
    edit: async (file, from, to) => replaceIn(dir, file, from, to),
    settle: async (message) => {
      await sh("git", ["add", "-A"], dir);
      await sh("git", [...COMMIT, message], dir);
    },
    head: async () => (await sh("git", ["rev-parse", "HEAD"], dir)).trim(),
    changeSet: () => {
      const text = read(".03kind/changeset.json");
      return text === null ? null : JSON.parse(text);
    },
    // The dev server, just stopped, may still be writing into it (its service, `.03kind/`): the removal is tried again for that.
    remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }),
  };
}

/** How long a dev server gets to answer: Next.js compiles the page as it is first asked for, and starts cold slowly. */
const READY_MS = { vite: 30_000, next: 180_000 };

/** The project's dev server on `port`, once it answers: Vite's, or Next.js's (with Turbopack, its default) for the Next.js example. */
export async function startDevServer(dir: string, port: number, example: Example = "vite-react19-tw4"): Promise<{ url: string; stop(): void }> {
  const next = example === "next-app-css-modules";
  // Next.js takes no other port when this one is taken: `--port` given, it fails (the bench picks a free one first).
  const args = next ? ["node_modules/next/dist/bin/next", "dev", "--port", String(port)] : ["node_modules/vite/bin/vite.js", "--port", String(port), "--strictPort"];
  const server = startServer(process.execPath, args, dir);
  const url = `http://localhost:${port}`;
  for (const until = Date.now() + READY_MS[next ? "next" : "vite"]; ; ) {
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
