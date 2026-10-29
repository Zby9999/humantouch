/**
 * Where an edit goes among the breakpoints (ADR 0008): the view the designer
 * works in, the breakpoint it stands for, and the range an edit made there
 * takes, beside the ranges the layer has the property changed at already.
 */
import { breakpointOf, clearOf, contains, widestFirst, within, writtenWith, type Breakpoint, type ProjectBreakpoints } from "./breakpoints";
import type { Change } from "./changeset";
import type { View, Views } from "./views";

/** The view the designer works in, among the views there are now. */
export interface WorkingView {
  /** Works in `view` from now on; null: the desktop view. */
  at(view: View | null): void;
  /** The view worked in when it is not the desktop view: null in the desktop view. */
  beside(): View | null;
  /** The breakpoint of the view worked in; null in the desktop view: every width. */
  breakpoint(): Breakpoint | null;
  /** The breakpoint of a view `width` px wide, beside the views there are now; null: the desktop view's, every width. */
  breakpointAt(width: number): Breakpoint | null;
  /** A view that shows `breakpoint` now, if one does: the view worked in first; null for none, or for every width. */
  viewAt(breakpoint: Breakpoint | null): View | null;
  /** The element that shows a canvas element in the view worked in, as it is now; the canvas's own in the desktop view, or in a view that shows none of it. */
  shown(el: Element): Element;
  /** The element that shows a canvas element as laid out at `breakpoint`, in the view that stands for it; the canvas's own at every width. */
  shownAt(breakpoint: Breakpoint | null, el: Element): Element;
  /** Does `f` as in the desktop view, at every width, whatever view is worked in; works there again after. */
  inDesktop<T>(f: () => T): T;
}

/**
 * The view worked in among `views`, the desktop view at first. `project`: the
 * project's own breakpoints, which the views' ranges line up with; none, they
 * follow the views' widths.
 */
export function createWorkingView(views: Views, project: ProjectBreakpoints | null): WorkingView {
  /** The view worked in; null: the desktop view. */
  let current: View | null = null;
  /** The views beside the desktop view. */
  const others = () => views.list().slice(1);
  const beside = () => (current && others().includes(current) ? current : null);
  const breakpointAt = (width: number) =>
    breakpointOf(
      width,
      views.canvas.width,
      others().map((v) => v.width),
      project,
    );
  const viewAt = (breakpoint: Breakpoint | null): View | null => {
    if (!breakpoint) return null;
    const view = beside();
    if (view && contains(breakpoint, view.width)) return view;
    return others().find((v) => contains(breakpoint, v.width)) ?? null;
  };
  const shownIn = (view: View | null, el: Element): Element => {
    if (!view || view === views.list()[0]) return el;
    views.sync();
    return view.elementOf(el) ?? el;
  };
  return {
    at(view) {
      current = view;
    },
    beside,
    breakpoint: () => {
      const view = beside();
      return view ? breakpointAt(view.width) : null;
    },
    breakpointAt,
    viewAt,
    shown: (el) => shownIn(current, el),
    shownAt: (breakpoint, el) => shownIn(viewAt(breakpoint), el),
    inDesktop(f) {
      const worked = current;
      current = null;
      try {
        return f();
      } finally {
        current = worked;
      }
    },
  };
}

/**
 * The range an edit to a property of a layer takes, made in a view `width` px
 * wide that stands for `range` (null: the desktop view, every width), given
 * `atBreakpoints`, the layer's changes to the property at breakpoints. It
 * takes the breakpoint of the narrowest of them that holds in the view, when
 * that is within the view's range, whether the view's own or one recorded
 * before the views changed. One reaching past the view's range is `cut`: it
 * keeps its value outside the range only, and the edit takes the view's
 * range; so does an edit with none (every width in the desktop view), as far
 * as no other range the property has of its own reaches into it, so no two
 * of them overlap.
 */
export function rangeOfEdit<C extends Pick<Change, "breakpoint">>(
  atBreakpoints: C[],
  width: number,
  range: Breakpoint | null,
  project: ProjectBreakpoints | null,
): { breakpoint: Breakpoint | null; cut: C | null } {
  // The narrowest, which wins, first.
  const [own] = atBreakpoints.filter((change) => contains(change.breakpoint, width)).sort((a, b) => widestFirst(b.breakpoint!, a.breakpoint!));
  if (own && within(own.breakpoint!, range)) return { breakpoint: own.breakpoint!, cut: null };
  if (!range) return { breakpoint: null, cut: null };
  const taken = atBreakpoints.filter((change) => change !== own).map((change) => change.breakpoint!);
  const clear = clearOf(range, width, taken);
  return { breakpoint: clear === range ? range : { ...clear, ...writtenWith(clear, project) }, cut: own ?? null };
}
