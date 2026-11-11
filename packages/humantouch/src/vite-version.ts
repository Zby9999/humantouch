import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Whether the Vite at `version` handles its HMR messages one at a time, each
 * update over before the next begins: from 6.3.0 on (vitejs/vite#19793).
 * Before, two updates may run side by side (ticket 125). A version it cannot
 * read, or a prerelease of 6.3.0, it takes as not.
 */
export function updatesInTurn(version: string | undefined): boolean {
  const read = /^(\d+)\.(\d+)\.(\d+)(?<prerelease>-)?/.exec(version ?? "");
  if (!read) return false;
  const [major, minor, patch] = [Number(read[1]), Number(read[2]), Number(read[3])];
  if (major !== 6) return major > 6;
  if (minor !== 3) return minor > 3;
  return patch > 0 || !read.groups?.prerelease;
}

/**
 * The version of the Vite serving the project at `root`: `told`, as Vite 7
 * on says it to its plugins; else the `vite` the project resolves, from its
 * root; else the one humantouch itself resolves (none, for a project with Vite
 * only through a framework, say). Undefined when none can be read.
 */
export async function viteVersionFor(root: string, told?: string): Promise<string | undefined> {
  if (told) return told;
  try {
    return (createRequire(join(root, "package.json"))("vite/package.json") as { version?: string }).version;
  } catch {
    // Not from the project's root: as humantouch resolves it.
  }
  try {
    return (await import("vite")).version;
  } catch {
    return undefined;
  }
}
