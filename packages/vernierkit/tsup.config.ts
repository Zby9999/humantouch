import { defineConfig } from "tsup";

// The configs build side by side, so none of them cleans `dist/`: that would race the others' output. `pnpm build` cleans first.

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
    entry: { react: "src/react.ts", "react.dev": "src/react.dev.ts" },
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["react"],
    noExternal: ["preact"],
    // So a Next.js server component, such as the root layout, can render <Vernier />.
    banner: { js: '"use client";' },
    dts: { entry: { react: "src/react.ts" } },
  },
]);
