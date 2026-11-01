import { readFile } from "node:fs/promises";
import { defineConfig, type Options } from "tsup";
import { compactStyleTemplates } from "./compact-css";

// The configs build side by side, so none of them cleans `dist/`: that would race the others' output. `pnpm build` cleans first.

/** The editor layer's CSS compacted as it builds (`compact-css.ts`): the toggle's counts toward what the page loads. */
const compactCss: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "compact-css",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]client[\\/](toggle-)?styles\.ts$/ }, async ({ path }) => ({
      contents: compactStyleTemplates(await readFile(path, "utf8"), path),
      loader: "ts",
    }));
  },
};

export default defineConfig([
  {
    entry: { vite: "src/vite.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    dts: true,
  },
  {
    entry: { next: "src/next.ts" },
    // A next.config.js may `require()` it.
    format: ["esm", "cjs"],
    platform: "node",
    target: "node20",
    dts: true,
  },
  {
    entry: { "next-loader": "src/next-loader.ts" },
    // Bundled, so the CommonJS loader never depends on ESM/CJS interop.
    noExternal: ["@babel/parser", "magic-string"],
    format: "cjs",
    platform: "node",
    target: "node20",
    // A loader is the module itself, not its `default`.
    footer: { js: "module.exports = module.exports.default;" },
  },
  {
    entry: { cli: "src/bin.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    // `editor.dev` is the editor layer but for the toggle, which `react.dev` imports once it is needed. An entry of
    // its own, so that import names a file the tests can tell; what both share (Preact, the toggle) goes in a chunk.
    entry: { react: "src/react.ts", "react.dev": "src/react.dev.ts", "editor.dev": "src/client/editor.ts" },
    format: "esm",
    splitting: true,
    // What the page loads is what the toggle is held to (docs/goals.md).
    minify: true,
    esbuildPlugins: [compactCss],
    // No source map: one would carry all of the source in the published package.
    platform: "browser",
    target: "es2022",
    external: ["react"],
    noExternal: ["preact"],
    // So a Next.js server component, such as the root layout, can render <ThirdKind />.
    banner: { js: '"use client";' },
    dts: { entry: { react: "src/react.ts" } },
  },
]);
