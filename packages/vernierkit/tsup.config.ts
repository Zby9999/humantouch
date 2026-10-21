import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { vite: "src/vite.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    dts: true,
    clean: true,
  },
  {
    entry: { "next-loader": "src/next-loader.ts" },
    // Bundled so the CommonJS loader never depends on ESM/CJS interop.
    noExternal: ["@babel/parser", "magic-string"],
    format: "cjs",
    platform: "node",
    target: "node20",
    // Loaders must be the module itself, not a `default` property.
    footer: { js: "module.exports = module.exports.default;" },
  },
  {
    entry: { react: "src/react.ts", "react.dev": "src/react.dev.ts" },
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["react"],
    // Lets Next.js server components (e.g. a root layout) render <Vernier />.
    banner: { js: '"use client";' },
    noExternal: ["preact"],
    dts: { entry: { react: "src/react.ts" } },
  },
]);
