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
    entry: { react: "src/react.ts", "react.dev": "src/react.dev.ts" },
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["react"],
    noExternal: ["preact"],
    dts: { entry: { react: "src/react.ts" } },
  },
]);
