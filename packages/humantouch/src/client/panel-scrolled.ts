/**
 * A panel's header stays at its top, over what scrolls under it; once what scrolls is scrolled, the line under the
 * header runs to the panel's edges, and back to its inset at the top again (designer, 2026-11-08). What scrolls is the
 * Design panel itself, and in the Layers panel its tree (designer, 2026-11-08: the Layers' header the Design's own).
 *
 * The panel is marked only when that flips, from a passive listener, and the line's CSS transition does the rest. A
 * data attribute, as Preact sets the panel's class. Returns what stops watching, and takes the mark off.
 */
export function watchScrolled(scroller: Element, panel: Element): () => void {
  let scrolled = false;
  const mark = () => {
    const now = scroller.scrollTop > 0;
    if (now === scrolled) return;
    scrolled = now;
    panel.toggleAttribute("data-scrolled", now);
  };
  scroller.addEventListener("scroll", mark, { passive: true });
  mark();
  return () => {
    scroller.removeEventListener("scroll", mark);
    panel.removeAttribute("data-scrolled");
  };
}
