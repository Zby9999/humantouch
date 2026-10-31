/**
 * The project's code changing under the page, as the dev server brings it in
 * (Vite's HMR updates, which the Vite plugin keeps on the page as
 * `CodeUpdates`). A file the page does not use brings nothing in, so it is no
 * change; nor are the editor layer's own saves into `.vernier/`. With no word
 * from the dev server (Next.js), there is never a change to tell.
 */
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../service-protocol";

/** Updates closer together than this are one change: several files saved at once, or one edit's CSS and its module. */
export const CODE_QUIET_MS = 1000;

/**
 * Calls `onChange` as the dev server begins to bring code into `win`'s page:
 * once for a run of updates, each within `quietMs` of the one before. Returns
 * the way to stop.
 */
export function watchCodeChanges(win: Window, onChange: () => void, { quietMs = CODE_QUIET_MS } = {}): () => void {
  const code = () => (win as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL];
  let at = code()?.at ?? 0;
  let last = -Infinity;
  const onCode = () => {
    const now = code();
    if (!now) return;
    // An update begun, or one in (begun before this watch did): an error brings no code in.
    const brought = now.updating > 0 || now.at > at;
    at = Math.max(at, now.at);
    if (!brought) return;
    const time = performance.now();
    const fresh = time - last >= quietMs;
    last = time;
    if (fresh) onChange();
  };
  win.addEventListener(CODE_EVENT, onCode);
  return () => win.removeEventListener(CODE_EVENT, onCode);
}
