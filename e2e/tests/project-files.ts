import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The example project, which the dev server serves. */
export const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));
export const VERNIER = `${EXAMPLE}.vernier/`;
const CLI = fileURLToPath(new URL("../../packages/vernierkit/dist/cli.js", import.meta.url));

/**
 * Takes a `.vernier/` folder away. The dev server's service may be writing
 * into it meanwhile: as the test before closes its page, the service rewrites
 * `checks.json`, and a file put in while the folder is being emptied fails the
 * removal (ENOTEMPTY). Node tries the removal again for that.
 */
export function clearVernier(folder: string) {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
}

/** Runs `npx vernierkit …` in the example project, as an Agent would. */
export async function vernierkit(...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

/** A JSON file in `.vernier/`, or null when it is not there. */
export function readVernier(file: string) {
  const path = `${VERNIER}${file}`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
