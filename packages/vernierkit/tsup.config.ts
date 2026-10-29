import { readFile } from "node:fs/promises";
import { defineConfig, type Options } from "tsup";

// The configs build side by side, so none of them cleans `dist/`: that would race the others' output. `pnpm build` cleans first.

/**
 * The editor layer's CSS (its templates marked `css` in `styles.ts` and
 * `toggle-styles.ts`) without comments and spare whitespace: the toggle's counts
 * toward what the page loads. The `${…}` placeholders are left as written. It
 * takes the CSS to have no strings with comments, colons or commas in them.
 */
const compactCss: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "compact-css",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]client[\\/](toggle-)?styles\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const compactText = (css: string) =>
        css
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s+/g, " ")
          .replace(/ ?([{};,]) ?/g, "$1")
          .replace(/: /g, ":")
          .replace(/;}/g, "}");
      const contents = source.replace(/\/\* css \*\/ `([^`]*)`/g, (_, css: string) => {
        const compact = css
          .split(/(\$\{[^}]*\})/)
          .map((part, i) => (i % 2 ? part : compactText(part)))
          .join("")
          .trim();
        return `\`${compact}\``;
      });
      return { contents, loader: "ts" };
    });
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
    // Minified, the editor layer's code is still read as written in the browser's developer tools (its CSS compacted).
    sourcemap: true,
    platform: "browser",
    target: "es2022",
    external: ["react"],
    noExternal: ["preact"],
    // So a Next.js server component, such as the root layout, can render <Vernier />.
    banner: { js: '"use client";' },
    dts: { entry: { react: "src/react.ts" } },
  },
]);
