/**
 * Remotion, for the small cards' videos (designer, 2026-11-11): the compositions in video/, drawn with the site's own
 * components, `@/` resolved as the site resolves it. Run from website/: `npx remotion studio`, `npx remotion render`.
 */
import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("video/index.ts");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve(process.cwd()) } },
}));
