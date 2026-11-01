import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The example project, which the dev server serves. */
export const EXAMPLE = fileURLToPath(new URL("../../examples/vite-react19-tw4/", import.meta.url));
export const THIRD_KIND_FOLDER = `${EXAMPLE}.03kind/`;
const CLI = fileURLToPath(new URL("../../packages/03kind/dist/cli.js", import.meta.url));

/**
 * Takes a `.03kind/` folder away. The dev server's service may be writing
 * into it meanwhile: as the test before closes its page, the service rewrites
 * `checks.json`, and a file put in while the folder is being emptied fails the
 * removal (ENOTEMPTY). Node tries the removal again for that.
 */
export function clearThirdKindFolder(folder: string) {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
}

/** Runs `npx 03kind …` in the example project, as an Agent would. */
export async function npx03kind(...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { cwd: EXAMPLE });
  return stdout;
}

/** A JSON file in `.03kind/`, or null when it is not there. */
export function readThirdKindFile(file: string) {
  const path = `${THIRD_KIND_FOLDER}${file}`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
