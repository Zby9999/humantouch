import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { withHumanTouch } from "humantouch/next";

/**
 * The site is a package of the repository's workspace: its dependencies, and the README it reads, are in the folder
 * above. Named as the root, so a build that starts in website/ (Vercel's) looks there too.
 */
const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every page is static (the editor demos run in the browser), so the site is exported as files: no server functions,
 * whose files Vercel would look for in website/ rather than the workspace's node_modules.
 */
const nextConfig: NextConfig = { output: "export", turbopack: { root }, outputFileTracingRoot: root };

export default withHumanTouch(nextConfig);
