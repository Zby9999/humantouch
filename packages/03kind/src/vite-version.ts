/**
 * Whether the Vite at `version` handles its HMR messages one at a time, each
 * update over before the next begins: from 6.3.0 on (vitejs/vite#19793).
 * Before, two updates may run side by side (ticket 125). A version it cannot
 * read, or a prerelease of 6.3.0, it takes as not.
 */
export function updatesInTurn(version: string | undefined): boolean {
  const read = /^(\d+)\.(\d+)\.(\d+)(-)?/.exec(version ?? "");
  if (!read) return false;
  const [major, minor, patch] = [Number(read[1]), Number(read[2]), Number(read[3])];
  if (major !== 6) return major > 6;
  if (minor !== 3) return minor > 3;
  return patch > 0 || !read[4];
}
