/**
 * Motion tokens for the toggle: the only part loaded before edit mode, held to its gzipped budget (docs/goals.md).
 * Whatever is here ships in the chunk the toggle and the editor share, so only what `Toggle.tsx` or
 * `toggle-styles.ts` uses belongs here; the editor's tokens go in `motion.ts`, which only the editor loads.
 */

/** How long the locked toggle is pressed and held to unlock it; a ring runs out meanwhile. */
export const UNLOCK_HOLD_MS = 1000;
