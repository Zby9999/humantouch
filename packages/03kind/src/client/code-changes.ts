/**
 * The project's code changing under the page, as the dev server brings it in
 * (Vite's HMR updates, which the Vite plugin keeps on the page as
 * `CodeUpdates`). A file the page does not use brings nothing in, so it is no
 * change; nor are the editor layer's own saves into `.03kind/`. With no word
 * from the dev server (Next.js), there is never a change to tell.
 */
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../service-protocol";

/** How the code `win`'s page has stands, as the dev server says; undefined when it says nothing (Next.js). */
export function codeUpdates(win: Window): CodeUpdates | undefined {
  return (win as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL];
}

/** Updates closer together than this are one change: several files saved at once, or one edit's CSS and its module. */
export const CODE_QUIET_MS = 1000;

/**
 * Calls `onChange` as the dev server begins to bring code into `win`'s page:
 * once for a run of updates, each within `quietMs` of the one before. Returns
 * the way to stop.
 */
export function watchCodeChanges(win: Window, onChange: () => void, { quietMs = CODE_QUIET_MS } = {}): () => void {
  let at = codeUpdates(win)?.at ?? 0;
  /** When the last update of the run so far came. */
  let lastUpdate = -Infinity;
  const onCode = () => {
    const updates = codeUpdates(win);
    if (!updates) return;
    // An update begun, or one in (begun before this watch did): an error brings no code in.
    const brought = updates.updating > 0 || updates.at > at;
    at = Math.max(at, updates.at);
    if (!brought) return;
    const now = performance.now();
    const fresh = now - lastUpdate >= quietMs;
    lastUpdate = now;
    if (fresh) onChange();
  };
  win.addEventListener(CODE_EVENT, onCode);
  return () => win.removeEventListener(CODE_EVENT, onCode);
}
