import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run, type Exec } from "../src/cli";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "vernierkit-install-"));
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
    if (/^(add|install)$/.test(args[0]) && args.includes("vernierkit")) {
      pkg.devDependencies = { ...pkg.devDependencies, vernierkit: "^0.1.0" };
      writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    } else if (/^(remove|uninstall)$/.test(args[0])) {
      delete pkg.devDependencies.vernierkit;
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
  test("installs Vernier Kit as a dev dependency with the project's package manager", async () => {
    viteProject("pnpm-lock.yaml");
    const { exec, commands } = fakeExec();

    const { code } = await cli(exec, "init");

    expect(code).toBe(0);
    expect(commands).toEqual(["pnpm add --save-dev vernierkit"]);
  });

  test("adds the plugin to the build config and mounts the editor layer in the root, and changes no other source", async () => {
    viteProject();

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toBe(`import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vernier from "vernierkit/vite";

export default defineConfig({
  plugins: [vernier(), react()],
});
`);
    expect(read("src/main.tsx")).toBe(`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Vernier } from "vernierkit/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Vernier />
  </StrictMode>,
);
`);
    expect(read("src/App.tsx")).toBe(`export function App() {\n  return <h1>Hello</h1>;\n}\n`);
  });
});

describe("init, the package manager", () => {
  test.each([
    ["package-lock.json", "npm install --save-dev vernierkit"],
    ["yarn.lock", "yarn add --dev vernierkit"],
    ["pnpm-lock.yaml", "pnpm add --save-dev vernierkit"],
  ])("with %s, installs with `%s`", async (lockfile, command) => {
    viteProject(lockfile);
    const { exec, commands } = fakeExec();

    await cli(exec, "init");

    expect(commands).toEqual([command]);
  });

  test("leaves the dependency alone when the project has it already", async () => {
    viteProject();
    const pkg = JSON.parse(read("package.json"));
    write("package.json", JSON.stringify({ ...pkg, devDependencies: { ...pkg.devDependencies, vernierkit: "^0.1.0" } }));
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
    expect(errors).toContain("npm install --save-dev vernierkit");
    expect(read("vite.config.ts")).toBe(VITE_CONFIG);
    expect(there("AGENTS.md")).toBe(false);
  });
});

describe("init, the Skill and .gitignore", () => {
  test("puts the Skill in .agents/skills and .claude/skills, and makes AGENTS.md pointing to it", async () => {
    viteProject();

    await cli(fakeExec().exec, "init");

    const skill = readFileSync(join(import.meta.dirname, "../skill/SKILL.md"), "utf8");
    expect(read(".agents/skills/vernierkit/SKILL.md")).toBe(skill);
    expect(read(".claude/skills/vernierkit/SKILL.md")).toBe(skill);
    expect(read("AGENTS.md")).toBe("Vernier Kit: to apply the designer's design changes, or undo the last round, follow `.agents/skills/vernierkit/SKILL.md`.\n");
  });

  test("adds one line to an AGENTS.md that is there, and leaves the rest of it", async () => {
    viteProject();
    write("AGENTS.md", "# Project\n\nUse pnpm.");

    await cli(fakeExec().exec, "init");

    expect(read("AGENTS.md")).toBe("# Project\n\nUse pnpm.\nVernier Kit: to apply the designer's design changes, or undo the last round, follow `.agents/skills/vernierkit/SKILL.md`.\n");
  });

  test("has git ignore .vernier/, adding a line to .gitignore or making it", async () => {
    viteProject();
    write(".gitignore", "node_modules\ndist\n");

    await cli(fakeExec().exec, "init");

    expect(read(".gitignore")).toBe("node_modules\ndist\n.vernier/\n");
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
    expect(output).toContain('import vernier from "vernierkit/vite";');
    expect(output).toContain("plugins: [vernier(), …]");
    expect(output).toContain("vite.config.ts: its exported config object could not be found");
    // The rest is done.
    expect(read("src/main.tsx")).toContain("<Vernier />");
    expect(there(".agents/skills/vernierkit/SKILL.md")).toBe(true);
  });

  test("an entry with no JSX to mount in: prints how to mount it", async () => {
    viteProject();
    write("src/main.tsx", `import { boot } from "./boot";\nboot();\n`);

    const { code, output } = await cli(fakeExec().exec, "init");

    expect(code).toBe(1);
    expect(output).toContain('import { Vernier } from "vernierkit/react";');
    expect(output).toContain("<Vernier />");
    expect(read("src/main.tsx")).toBe(`import { boot } from "./boot";\nboot();\n`);
  });
});

describe("init, other shapes of the source", () => {
  test("a config with no plugins yet, and an entry that renders the app alone", async () => {
    viteProject();
    write("vite.config.ts", `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  server: { port: 3000 },\n})\n`);
    write("src/main.tsx", `import ReactDOM from 'react-dom/client'\nimport App from './App'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)\n`);

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toBe(`import { defineConfig } from 'vite'\nimport vernier from 'vernierkit/vite'\n\nexport default defineConfig({\n  plugins: [vernier()],\n  server: { port: 3000 },\n})\n`);
    expect(read("src/main.tsx")).toBe(`import ReactDOM from 'react-dom/client'\nimport App from './App'\nimport { Vernier } from 'vernierkit/react'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<><App /><Vernier /></>)\n`);
  });

  test("a config made by a function, with plugins one per line", async () => {
    viteProject();
    write("vite.config.ts", `import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig(({ mode }) => ({\n  plugins: [\n    react(),\n  ],\n}));\n`);

    await cli(fakeExec().exec, "init");

    expect(read("vite.config.ts")).toContain(`  plugins: [\n    vernier(),\n    react(),\n  ],`);
  });
});

describe("init, again", () => {
  test("changes nothing the first run did", async () => {
    viteProject();
    write(".gitignore", "node_modules\n");
    write("AGENTS.md", "# Project\n");
    const { exec, commands } = fakeExec();
    await cli(exec, "init");
    const files = ["package.json", "vite.config.ts", "src/main.tsx", "AGENTS.md", ".gitignore", ".vernier/install.json"];
    const first = files.map(read);

    const { code } = await cli(exec, "init");

    expect(code).toBe(0);
    expect(files.map(read)).toEqual(first);
    expect(commands).toHaveLength(1);
  });

  test("leaves a project that mounts the editor layer somewhere else of its own as it is", async () => {
    viteProject();
    write("src/App.tsx", `import { Vernier } from "vernierkit/react";\n\nexport function App() {\n  return <h1>Hello<Vernier /></h1>;\n}\n`);

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
    writeFileSync(join(outDir, "assets/index.js"), `function Vernier(){return null}console.log("app");${extra}`);
  };
}

describe("doctor", () => {
  test("after init, reports each part installed, and a production build with none of the editor layer", async () => {
    viteProject();
    const { exec, commands } = fakeExec(builtPage());
    await cli(exec, "init");

    const { code, output } = await cli(exec, "doctor");

    expect(code).toBe(0);
    expect(output).toContain("✓ vernierkit is a dependency");
    expect(output).toContain("✓ vite.config.ts: adds the plugin");
    expect(output).toContain("✓ src/main.tsx: mounts the editor layer");
    expect(output).toContain("✓ .agents/skills/vernierkit/SKILL.md");
    expect(output).toContain("✓ .claude/skills/vernierkit/SKILL.md");
    expect(output).toContain("✓ AGENTS.md points to the Skill");
    expect(output).toContain("✓ .gitignore ignores .vernier/");
    expect(output).toContain("✓ A production build has none of the editor layer");
    expect(output).not.toContain("✗");
    expect(commands.at(-1)).toMatch(/^pnpm exec vite build --outDir \S+ --emptyOutDir$/);
  });

  test("before init, reports what is missing, and how to fix it", async () => {
    viteProject();

    const { code, output } = await cli(fakeExec(builtPage()).exec, "doctor");

    expect(code).toBe(1);
    expect(output).toContain("✗ vernierkit is not a dependency: run `pnpm add --save-dev vernierkit`");
    expect(output).toContain("✗ The build config does not add the plugin.");
    expect(output).toContain("✗ Nothing mounts the editor layer.");
    expect(output).toContain("✗ .agents/skills/vernierkit/SKILL.md is missing");
  });

  test("a production build with editor layer code in it fails", async () => {
    viteProject();
    const { exec } = fakeExec(builtPage(`customElements.define("vernier-kit",class{})`));
    await cli(exec, "init");

    const { code, output } = await cli(exec, "doctor");

    expect(code).toBe(1);
    expect(output).toMatch(/✗ A production build has editor layer code in it: assets[/\\]index\.js/);
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
