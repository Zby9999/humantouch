import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run, type Exec } from "../src/cli";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "humantouch-install-"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(dirname(join(project, file)), { recursive: true });
  writeFileSync(join(project, file), text);
}

function read(file: string) {
  return readFileSync(join(project, file), "utf8");
}

function there(file: string) {
  return existsSync(join(project, file));
}

/** The Skill as the package ships it. */
const SKILL = readFileSync(join(import.meta.dirname, "../skill/SKILL.md"), "utf8");

const VITE_CONFIG = `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`;

const MAIN = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

/** A Vite + React project as `npm create vite` makes it, with `lockfile` telling its package manager. */
function viteProject(lockfile = "pnpm-lock.yaml") {
  write(
    "package.json",
    `${JSON.stringify({ name: "app", private: true, type: "module", scripts: { dev: "vite" }, dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" }, devDependencies: { vite: "^8.0.0", "@vitejs/plugin-react": "^6.0.0" } }, null, 2)}\n`,
  );
  write(lockfile, "");
  write("index.html", `<!doctype html>\n<html>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`);
  write("vite.config.ts", VITE_CONFIG);
  write("src/main.tsx", MAIN);
  write("src/App.tsx", `export function App() {\n  return <h1>Hello</h1>;\n}\n`);
}

/**
 * Stands in for the package manager and the build: records each command, and
 * adds or removes the dependency in package.json as the real one would.
 */
function fakeExec(build?: (outDir: string) => void) {
  const commands: string[] = [];
  const exec: Exec = async (command, args, { cwd }) => {
    commands.push([command, ...args].join(" "));
    const pkgFile = join(cwd, "package.json");
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
    if (/^(add|install)$/.test(args[0]) && args.includes("humantouch")) {
      pkg.devDependencies = { ...pkg.devDependencies, "humantouch": "^0.1.0" };
      writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    } else if (/^(remove|uninstall)$/.test(args[0])) {
      delete pkg.devDependencies["humantouch"];
      writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    } else if (args.includes("build")) {
      const outDir = args[args.indexOf("--outDir") + 1];
      build?.(outDir);
    }
    return { code: 0, output: "" };
  };
  return { exec, commands };
}

async function cli(exec: Exec, ...args: string[]) {
  let output = "";
  let errors = "";
  const code = await run(args, { cwd: project, write: (text) => (output += text), error: (text) => (errors += text), exec });
  return { code, output, errors };
}

describe("init, on a Vite project", () => {
  test("installs Human Touch as a dev dependency with the project's package manager", async () => {
    viteProject("pnpm-lock.yaml");
    const { exec, commands } = fakeExec();

    const { code } = await cli(exec, "init");

    expect(code).toBe(0);
    expect(commands).toEqual(["pnpm add --save-dev humantouch"]);
  });

  test("adds the plugin to the build config and mounts the editor layer in the root, and changes no other source", async () => {
    viteProject();

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toBe(`import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import humanTouch from "humantouch/vite";

export default defineConfig({
  plugins: [humanTouch(), react()],
});
`);
    expect(read("src/main.tsx")).toBe(`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HumanTouch } from "humantouch/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <HumanTouch />
  </StrictMode>,
);
`);
    expect(read("src/App.tsx")).toBe(`export function App() {\n  return <h1>Hello</h1>;\n}\n`);
  });
});

describe("init, the package manager", () => {
  test.each([
    ["package-lock.json", "npm install --save-dev humantouch"],
    ["yarn.lock", "yarn add --dev humantouch"],
    ["pnpm-lock.yaml", "pnpm add --save-dev humantouch"],
  ])("with %s, installs with `%s`", async (lockfile, command) => {
    viteProject(lockfile);
    const { exec, commands } = fakeExec();

    await cli(exec, "init");

    expect(commands).toEqual([command]);
  });

  test("leaves the dependency alone when the project has it already", async () => {
    viteProject();
    const pkg = JSON.parse(read("package.json"));
    write("package.json", JSON.stringify({ ...pkg, devDependencies: { ...pkg.devDependencies, "humantouch": "^0.1.0" } }));
    const { exec, commands } = fakeExec();

    expect((await cli(exec, "init")).code).toBe(0);
    expect(commands).toEqual([]);
  });

  test("when the install fails, says so and changes nothing else", async () => {
    viteProject("package-lock.json");
    const exec: Exec = async () => ({ code: 1, output: "npm ERR! network" });

    const { code, errors } = await cli(exec, "init");

    expect(code).toBe(1);
    expect(errors).toContain("npm ERR! network");
    expect(errors).toContain("npm install --save-dev humantouch");
    expect(read("vite.config.ts")).toBe(VITE_CONFIG);
    expect(there("AGENTS.md")).toBe(false);
  });
});

describe("init, the Skill and .gitignore", () => {
  test("puts the Skill in .agents/skills and .claude/skills, and makes AGENTS.md pointing to it", async () => {
    viteProject();

    await cli(fakeExec().exec, "init");

    expect(read(".agents/skills/humantouch/SKILL.md")).toBe(SKILL);
    expect(read(".claude/skills/humantouch/SKILL.md")).toBe(SKILL);
    expect(read("AGENTS.md")).toBe("Human Touch: to apply the designer's design changes, or undo the last round, follow `.agents/skills/humantouch/SKILL.md`.\n");
  });

  // What a put back is, the claim says in its change notes (ticket 65): see "claim, layers off the canvas put back" in cli.test.ts.
  test("the Skill never calls an off-canvas layer set aside", () => {
    expect(SKILL).not.toMatch(/set aside|aside (beside|off)/i);
  });

  test("adds one line to an AGENTS.md that is there, and leaves the rest of it", async () => {
    viteProject();
    write("AGENTS.md", "# Project\n\nUse pnpm.");

    await cli(fakeExec().exec, "init");

    expect(read("AGENTS.md")).toBe("# Project\n\nUse pnpm.\nHuman Touch: to apply the designer's design changes, or undo the last round, follow `.agents/skills/humantouch/SKILL.md`.\n");
  });

  test("has git ignore .humantouch/, adding a line to .gitignore or making it", async () => {
    viteProject();
    write(".gitignore", "node_modules\ndist\n");

    await cli(fakeExec().exec, "init");

    expect(read(".gitignore")).toBe("node_modules\ndist\n.humantouch/\n");
  });
});

describe("init, when it cannot edit the project's source", () => {
  test("a config it cannot read: installs the rest, and prints the steps to finish by hand", async () => {
    viteProject();
    const config = `module.exports = require("./config/vite.base.cjs");\n`;
    write("vite.config.ts", config);

    const { code, output } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(read("vite.config.ts")).toBe(config);
    expect(output).toContain("Finish by hand:");
    expect(output).toContain('import humanTouch from "humantouch/vite";');
    expect(output).toContain("plugins: [humanTouch(), …]");
    expect(output).toContain("vite.config.ts: its exported config object could not be found");
    // The rest is done.
    expect(read("src/main.tsx")).toContain("<HumanTouch />");
    expect(there(".agents/skills/humantouch/SKILL.md")).toBe(true);
  });

  test("an entry with no JSX to mount in: prints how to mount it", async () => {
    viteProject();
    write("src/main.tsx", `import { boot } from "./boot";\nboot();\n`);

    const { code, output } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(output).toContain('import { HumanTouch } from "humantouch/react";');
    expect(output).toContain("<HumanTouch />");
    expect(read("src/main.tsx")).toBe(`import { boot } from "./boot";\nboot();\n`);
  });
});

describe("init, other shapes of the source", () => {
  test("a config with no plugins yet, and an entry that renders the app alone", async () => {
    viteProject();
    write("vite.config.ts", `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  server: { port: 3000 },\n})\n`);
    write("src/main.tsx", `import ReactDOM from 'react-dom/client'\nimport App from './App'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)\n`);

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toBe(`import { defineConfig } from 'vite'\nimport humanTouch from 'humantouch/vite'\n\nexport default defineConfig({\n  plugins: [humanTouch()],\n  server: { port: 3000 },\n})\n`);
    expect(read("src/main.tsx")).toBe(`import ReactDOM from 'react-dom/client'\nimport App from './App'\nimport { HumanTouch } from 'humantouch/react'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<><App /><HumanTouch /></>)\n`);
  });

  test("a config made by a function, with plugins one per line", async () => {
    viteProject();
    write("vite.config.ts", `import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig(({ mode }) => ({\n  plugins: [\n    react(),\n  ],\n}));\n`);

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toContain(`  plugins: [\n    humanTouch(),\n    react(),\n  ],`);
  });
});

describe("init, again", () => {
  test("changes nothing the first run did", async () => {
    viteProject();
    write(".gitignore", "node_modules\n");
    write("AGENTS.md", "# Project\n");
    const { exec, commands } = fakeExec();
    await cli(exec, "init");
    const files = ["package.json", "vite.config.ts", "src/main.tsx", "AGENTS.md", ".gitignore", ".humantouch/install.json"];
    const first = files.map(read);

    const { code } = await cli(exec, "init");

    expect(code).toBe(0);
    expect(files.map(read)).toEqual(first);
    expect(commands).toHaveLength(1);
  });

  test("leaves a project that mounts the editor layer somewhere else of its own as it is", async () => {
    viteProject();
    write("src/App.tsx", `import { HumanTouch } from "humantouch/react";\n\nexport function App() {\n  return <h1>Hello<HumanTouch /></h1>;\n}\n`);

    await cli(fakeExec().exec, "init");

    expect(read("src/main.tsx")).toBe(MAIN);
  });
});

describe("init, outside a project it can install into", () => {
  test("a project without React, or with neither Vite nor Next.js, is turned down", async () => {
    write("package.json", JSON.stringify({ name: "api", dependencies: { express: "^5.0.0" } }));

    const { code, errors } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(errors).toMatch(/React/);
    expect(there("AGENTS.md")).toBe(false);
  });
});

/** A production build as Vite writes it, with `extra` in its script. */
function builtPage(extra = "") {
  return (outDir: string) => {
    mkdirSync(join(outDir, "assets"), { recursive: true });
    writeFileSync(join(outDir, "index.html"), `<!doctype html><script type="module" src="/assets/index.js"></script>`);
    writeFileSync(join(outDir, "assets/index.js"), `function HumanTouch(){return null}console.log("app");${extra}`);
  };
}

describe("doctor", () => {
  test("after init, reports each part installed, and a production build with none of the editor layer", async () => {
    viteProject();
    const { exec, commands } = fakeExec(builtPage());
    await cli(exec, "init");

    const { code, output } = await cli(exec, "doctor");

    expect(code).toBe(0);
    expect(output).toContain("✓ humantouch is a dependency");
    expect(output).toContain("✓ vite.config.ts: adds the plugin");
    expect(output).toContain("✓ src/main.tsx: mounts the editor layer");
    expect(output).toContain("✓ .agents/skills/humantouch/SKILL.md");
    expect(output).toContain("✓ .claude/skills/humantouch/SKILL.md");
    expect(output).toContain("✓ AGENTS.md points to the Skill");
    expect(output).toContain("✓ .gitignore ignores .humantouch/");
    expect(output).toContain("✓ A production build has none of the editor layer");
    expect(output).not.toContain("✗");
    expect(commands.at(-1)).toMatch(/^pnpm exec vite build --outDir \S+ --emptyOutDir$/);
  });

  test("before init, reports what is missing, and how to fix it", async () => {
    viteProject();

    const { code, output } = await cli(fakeExec(builtPage()).exec, "doctor");

    expect(code).toBe(1);
    expect(output).toContain("✗ humantouch is not a dependency: run `pnpm add --save-dev humantouch`");
    expect(output).toContain("✗ The build config does not add the plugin.");
    expect(output).toContain("✗ Nothing mounts the editor layer.");
    expect(output).toContain("✗ .agents/skills/humantouch/SKILL.md is missing");
  });

  test.each([
    ["the toggle", `var t="human-touch",g="__HUMAN_TOUCH__";customElements.define(t,class{})`],
    ["the token header", `fetch("/round",{headers:{"X-Human-Touch-Token":k}})`],
    ["an element's source marker", `jsx("h1",{"data-ht-loc":"src/App.tsx:21:11"})`],
    ["the edits' CSS layer", `s.textContent="@layer human-touch-edits;"`],
  ])("a production build with editor layer code in it fails: %s", async (_, code) => {
    viteProject();
    const { exec } = fakeExec(builtPage(code));
    await cli(exec, "init");

    const { code: exit, output } = await cli(exec, "doctor");

    expect(exit).toBe(1);
    expect(output).toMatch(/✗ A production build has editor layer code in it: assets[/\\]index\.js/);
  });

  test("a production build that only uses the words human touch, as a class, a slug, text or another package, passes", async () => {
    viteProject();
    const ordinary = `el.className="human-touch";fetch("/blog/human-touch");h1.textContent="A Human Touch";import("human-touch");document.createElement("human-touch-card")`;
    const { exec } = fakeExec(builtPage(ordinary));
    await cli(exec, "init");

    const { code, output } = await cli(exec, "doctor");

    expect(output).toContain("✓ A production build has none of the editor layer");
    expect(code).toBe(0);
  });

  test("a production build that fails is reported, with what it printed", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    const failing: Exec = async (command, args, options) => (args.includes("build") ? { code: 1, output: "error TS2304" } : exec(command, args, options));

    const { code, output } = await cli(failing, "doctor");

    expect(code).toBe(1);
    expect(output).toContain("✗ The production build failed");
    expect(output).toContain("error TS2304");
  });
});

describe("remove", () => {
  /** Every file of the project and its text, but for `.humantouch/`. */
  function snapshot() {
    const files: Record<string, string> = {};
    const visit = (dir: string) => {
      for (const entry of readdirSync(join(project, dir), { withFileTypes: true })) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) visit(path);
        else files[path] = read(path);
      }
    };
    visit("");
    return files;
  }

  test("after init, puts every file back as it was, uninstalls the package and deletes .humantouch/", async () => {
    viteProject();
    write("AGENTS.md", "# Project\n\nUse pnpm.");
    write(".gitignore", "node_modules");
    const before = snapshot();
    const { exec, commands } = fakeExec();
    await cli(exec, "init");

    const { code, output } = await cli(exec, "remove");

    expect(code).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(there(".humantouch")).toBe(false);
    expect(there(".agents")).toBe(false);
    expect(there(".claude")).toBe(false);
    expect(commands.at(-1)).toBe("pnpm remove humantouch");
    expect(output).toMatch(/removed/i);
  });

  test("deletes AGENTS.md and .gitignore when init made them", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");

    await cli(exec, "remove");

    expect(there("AGENTS.md")).toBe(false);
    expect(there(".gitignore")).toBe(false);
  });

  test("keeps the other skills in .claude/skills", async () => {
    viteProject();
    write(".claude/skills/deploy/SKILL.md", "# Deploy");
    const { exec } = fakeExec();
    await cli(exec, "init");

    await cli(exec, "remove");

    expect(read(".claude/skills/deploy/SKILL.md")).toBe("# Deploy");
    expect(there(".claude/skills/humantouch")).toBe(false);
  });

  test("with design changes not applied yet, refuses, and says to apply or discard them first", async () => {
    viteProject();
    const { exec, commands } = fakeExec();
    await cli(exec, "init");
    write(".humantouch/changeset.json", JSON.stringify({ lastId: 1, changes: [{ id: 1 }] }));

    const { code, errors } = await cli(exec, "remove");

    expect(code).toBe(1);
    expect(errors).toMatch(/not applied/);
    expect(errors).toMatch(/discard/);
    expect(read("vite.config.ts")).toContain("humanTouch()");
    expect(there(".humantouch/changeset.json")).toBe(true);
    expect(commands).toHaveLength(1);
  });

  test("while a round is being applied, refuses, and says to finish it first", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    write(".humantouch/changeset.json", JSON.stringify({ lastId: 1, changes: [{ id: 1 }] }));
    write(".humantouch/state.json", JSON.stringify({ status: "claimed", done: [] }));

    const { code, errors } = await cli(exec, "remove");

    expect(code).toBe(1);
    expect(errors).toMatch(/being applied/);
    expect(errors).toContain("npx humantouch finish");
  });

  test("deletes the layers off the canvas too, which belong to no round, and says so", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    write(".humantouch/off-canvas.json", JSON.stringify({ layers: [{ id: "a" }, { id: "b" }] }));

    const { code, output } = await cli(exec, "remove");

    expect(code).toBe(0);
    expect(there(".humantouch")).toBe(false);
    expect(output).toContain("Deleted .humantouch/, with the 2 layers the designer had moved off the canvas");
  });

  test("run again, does nothing and does not fail", async () => {
    viteProject();
    const { exec, commands } = fakeExec();
    await cli(exec, "init");
    await cli(exec, "remove");
    const before = snapshot();

    const { code, output } = await cli(exec, "remove");

    expect(code).toBe(0);
    expect(output).toMatch(/not installed/i);
    expect(snapshot()).toEqual(before);
    expect(commands).toHaveLength(2);
  });

  test("a line changed since init is left, with the step to take it out by hand", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    write("vite.config.ts", read("vite.config.ts").replace("plugins: [humanTouch(), react()]", "plugins: [humanTouch(), react(), legacy()]"));

    const { code, output } = await cli(exec, "remove");

    expect(code).toBe(1);
    expect(output).toContain("vite.config.ts");
    expect(output).toContain("humanTouch()");
    expect(read("vite.config.ts")).not.toContain("humantouch/vite");
    expect(read("src/main.tsx")).toBe(MAIN);
  });
});

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

const LAYOUT = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "App" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
`;

/** A Next.js App Router project as `create-next-app` makes it. */
function nextProject(lockfile = "package-lock.json") {
  write(
    "package.json",
    `${JSON.stringify({ name: "app", private: true, scripts: { dev: "next dev", build: "next build" }, dependencies: { next: "16.4.3", react: "19.3.0", "react-dom": "19.3.0" } }, null, 2)}\n`,
  );
  write(lockfile, "");
  write("next.config.ts", NEXT_CONFIG);
  write("app/layout.tsx", LAYOUT);
  write("app/page.tsx", `export default function Home() {\n  return <main>Hello</main>;\n}\n`);
}

describe("init, on a Next.js project", () => {
  test("wraps the config with withHumanTouch() and mounts the editor layer in the root layout's body", async () => {
    nextProject();
    const { exec, commands } = fakeExec();

    const { code, output } = await cli(exec, "init");

    expect(code).toBe(0);
    expect(output).toContain("Next.js");
    expect(commands).toEqual(["npm install --save-dev humantouch"]);
    expect(read("next.config.ts")).toBe(`import type { NextConfig } from "next";
import { withHumanTouch } from "humantouch/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withHumanTouch(nextConfig);
`);
    expect(read("app/layout.tsx")).toBe(`import type { Metadata } from "next";
import "./globals.css";
import { HumanTouch } from "humantouch/react";

export const metadata: Metadata = { title: "App" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <HumanTouch />
      </body>
    </html>
  );
}
`);
  });

  test("a config written in CommonJS, and a root layout under src/", async () => {
    nextProject();
    rmSync(join(project, "next.config.ts"));
    rmSync(join(project, "app"), { recursive: true });
    write("next.config.js", `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n`);
    write("src/app/layout.jsx", `export default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`);

    expect((await cli(fakeExec().exec, "init")).code).toBe(0);

    expect(read("next.config.js")).toBe(`const { withHumanTouch } = require("humantouch/next");\n/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = withHumanTouch(nextConfig);\n`);
    expect(read("src/app/layout.jsx")).toContain(`      <body>{children}<HumanTouch /></body>`);
  });

  test("a config already wrapped by another plugin is wrapped once more, outside it", async () => {
    nextProject();
    write("next.config.mjs", `import createMDX from "@next/mdx";\n\nconst withMDX = createMDX();\n\nexport default withMDX({ pageExtensions: ["tsx", "mdx"] });\n`);
    rmSync(join(project, "next.config.ts"));

    await cli(fakeExec().exec, "init");

    expect(read("next.config.mjs")).toBe(`import createMDX from "@next/mdx";\nimport { withHumanTouch } from "humantouch/next";\n\nconst withMDX = createMDX();\n\nexport default withHumanTouch(withMDX({ pageExtensions: ["tsx", "mdx"] }));\n`);
  });

  test("a root layout with no <body> to mount in: prints how to mount it", async () => {
    nextProject();
    write("app/layout.tsx", `export { default } from "../layouts/Root";\n`);

    const { code, output } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(output).toContain("Finish by hand:");
    expect(output).toContain("<body>");
    expect(output).toContain("<HumanTouch />");
  });

  test("a Next.js project with Vite in it too, for its tests, is taken for Next.js", async () => {
    nextProject();
    const pkg = JSON.parse(read("package.json"));
    write("package.json", JSON.stringify({ ...pkg, devDependencies: { vite: "^8.0.0", vitest: "^5.0.0" } }));

    await cli(fakeExec().exec, "init");

    expect(read("next.config.ts")).toContain("withHumanTouch(nextConfig)");
    expect(there("vite.config.ts")).toBe(false);
  });

  test("remove puts it back as it was", async () => {
    nextProject();
    const { exec } = fakeExec();
    await cli(exec, "init");

    expect((await cli(exec, "remove")).code).toBe(0);

    expect(read("next.config.ts")).toBe(NEXT_CONFIG);
    expect(read("app/layout.tsx")).toBe(LAYOUT);
  });
});

describe("doctor, on a Next.js project", () => {
  test("runs next build, and looks through what it built for the editor layer", async () => {
    nextProject();
    const { exec, commands } = fakeExec();
    await cli(exec, "init");
    const building: Exec = async (command, args, options) => {
      if (args.includes("build")) {
        write(".next/static/chunks/app/page.js", "console.log('page')");
        write(".next/server/app/page.js", `"use client";function HumanTouch(){return null}`);
        // Next.js rewrites it for the build: doctor puts it back.
        write("next-env.d.ts", "/// build\n");
      }
      return exec(command, args, options);
    };
    write("next-env.d.ts", "/// dev\n");

    const { code, output } = await cli(building, "doctor");

    expect(output).toContain("✓ next.config.ts: adds the plugin");
    expect(output).toContain("✓ app/layout.tsx: mounts the editor layer");
    expect(output).toContain("✓ A production build has none of the editor layer");
    expect(code).toBe(0);
    expect(commands.at(-1)).toBe("npx --no-install next build");
    expect(read("next-env.d.ts")).toBe("/// dev\n");
  });

  test("a build with source markers in it fails", async () => {
    nextProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    const building: Exec = async (command, args, options) => {
      if (args.includes("build")) write(".next/static/chunks/app/page.js", `e("main",{"data-ht-loc":"app/page.tsx:2:10"})`);
      return exec(command, args, options);
    };

    const { code, output } = await cli(building, "doctor");

    expect(code).toBe(1);
    expect(output).toMatch(/✗ A production build has editor layer code in it: static[/\\]chunks[/\\]app[/\\]page\.js/);
  });
});

describe("review fixes", () => {
  test("remove puts back a config object wrapped over several lines, beside another call that ends the same way", async () => {
    nextProject();
    rmSync(join(project, "next.config.ts"));
    const config = `import createMDX from "@next/mdx";\n\nconst withMDX = createMDX({\n  extension: /\\.mdx?$/,\n})\n\nexport default {\n  reactStrictMode: true,\n}\n`;
    write("next.config.mjs", config);
    const { exec } = fakeExec();
    await cli(exec, "init");
    expect(read("next.config.mjs")).toContain("export default withHumanTouch({\n  reactStrictMode: true,\n})\n");

    expect((await cli(exec, "remove")).code).toBe(0);

    expect(read("next.config.mjs")).toBe(config);
  });

  test("init again after the source was checked out as it was: remove still puts everything back", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    write("vite.config.ts", VITE_CONFIG);
    write("src/main.tsx", MAIN);
    await cli(exec, "init");

    const { code, output } = await cli(exec, "remove");

    expect(output).not.toContain("Finish by hand");
    expect(code).toBe(0);
    expect(read("vite.config.ts")).toBe(VITE_CONFIG);
    expect(read("src/main.tsx")).toBe(MAIN);
  });

  test("a config that imports the plugin but does not use it is not taken as done", async () => {
    viteProject();
    write("vite.config.ts", `import humanTouch from "humantouch/vite";\n${VITE_CONFIG}`);

    const { code, output } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(output).toContain("vite.config.ts: it imports humantouch but does not add the plugin");
    expect((await cli(fakeExec(builtPage()).exec, "doctor")).output).toContain("✗ The build config does not add the plugin.");
  });

  test("a Next.js project older than 16 is turned down", async () => {
    nextProject();
    const pkg = JSON.parse(read("package.json"));
    write("package.json", JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, next: "^15.3.0" } }));

    const { code, errors } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(errors).toContain("Next.js 16");
    expect(read("next.config.ts")).toBe(NEXT_CONFIG);
  });

  test("doctor builds with webpack when the project's build does", async () => {
    nextProject();
    const pkg = JSON.parse(read("package.json"));
    write("package.json", JSON.stringify({ ...pkg, scripts: { build: "next build --webpack" } }));
    const { exec, commands } = fakeExec();
    await cli(exec, "init");

    await cli(exec, "doctor");

    expect(commands.at(-1)).toBe("npx --no-install next build --webpack");
  });

  test("remove that leaves a line by hand does not say it took everything out", async () => {
    viteProject();
    const { exec } = fakeExec();
    await cli(exec, "init");
    write("vite.config.ts", read("vite.config.ts").replace("plugins: [humanTouch(), react()]", "plugins: [humanTouch(), react(), legacy()]"));

    const { output } = await cli(exec, "remove");

    expect(output).not.toContain("Took the plugin");
    expect(output).toContain("Finish by hand");
  });
});
