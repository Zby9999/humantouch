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
    dts: { entry: { react: "src/react.ts" } },
  },
]);
