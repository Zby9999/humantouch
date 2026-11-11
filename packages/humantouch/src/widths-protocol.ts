/**
 * What the page says of a change at widths other than the one it is made at
 * (ADR 0016, ticket 147): a change made in the desktop view drawn otherwise
 * at another view's width is adapted there, and shown; at any width, the
 * layer breaking the layout as it did not when the round was claimed is not
 * shown. Apart from `service-protocol.ts`, as `outside-protocol.ts` is: that
 * file's code goes with the toggle the page loads first, whose bytes a word
 * more there changes.
 */
import type { CheckResult } from "./service-protocol";

/**
 * A width a change made in the desktop view is drawn otherwise at than on the
 * canvas, other than the page's window: adapted there, as the Agent may (ADR
 * 0016). `actual`: what the page shows of the change there instead, as a
 * check that does not show it says (`CheckResult`'s `actual`); `drawn`, of a
 * width or a height, how wide or tall it is drawn there, px.
 */
export interface AdaptedAt {
  width: number;
  actual: unknown;
  drawn?: number;
}

/** A check's result where the page shows a change, adapted at the widths `adapted` (ticket 147). */
export type ShownAdapted = Extract<CheckResult, { outcome: "shown" }> & { adapted?: AdaptedAt[] };

/** The widths a check found a change adapted at, if it did. */
export function adaptedIn(result: CheckResult | undefined): AdaptedAt[] | undefined {
  return result?.outcome === "shown" ? (result as ShownAdapted).adapted : undefined;
}

/**
 * How a layer breaks the layout at a width (ADR 0016): it makes the page
 * wider than the screen, so that it scrolls sideways (`page`); it is wider
 * than its container (`wider`); something around it that hides what
 * overflows it cuts it off (`clipped`).
 */
export type BreakKind = "page" | "wider" | "clipped";

/**
 * A break a change's layer makes at `width` that it did not when the round
 * was claimed (ticket 147): of the layer itself, or of its container (`of`).
 * `size` and `room`, of one wider than its container: how wide it is drawn,
 * and how wide its container's content is, px. `by`, of one cut off: by the
 * screen, pushed past its start edge (left; right to left, right), which the
 * page cannot be scrolled to; else by an element around it. `late`: the page
 * noted that width only after the code changed (`BreaksNote.late`), and
 * cannot tell whether the break is new.
 */
export interface BreakFound {
  width: number;
  kind: BreakKind;
  of: "layer" | "container";
  size?: number;
  room?: number;
  by?: "screen";
  late?: true;
}

/**
 * Properties whose change cannot break the layout (ticket 147): they change
 * how a layer is painted alone, or where its text sits in its lines, never
 * its size or its place. A change to one is not looked at for breaks.
 */
export const DRAWS_NO_BREAK = new Set<string>(["fill", "radius", "shadows", "textShadows", "opacity", "layerBlur", "backgroundBlur", "clip", "textColor", "textDecoration", "textAlign"]);

/** A check's result where the page does not show a change (ADR 0016): its layer shows the value, but breaks the layout at a width as it did not when the round was claimed (`breaks`); `actual` is then the change's own value. */
export type NotShownBroken = Extract<CheckResult, { outcome: "not shown" }> & { breaks?: BreakFound[] };

/** The breaks a check found a change's layer making, if it did. */
export function breaksIn(result: CheckResult | undefined): BreakFound[] | undefined {
  return result?.outcome === "not shown" ? (result as NotShownBroken).breaks : undefined;
}

/**
 * What breaks of the layout a change's layer made at a width when the round
 * was claimed (ticket 147): whether the page scrolled sideways there, and the
 * breaks of its elements, each as `<element's place, from 0>:<layer or
 * container>:<kind>`; `over`, by key, how far each reached past where it is
 * to stay, px, and by `page`, how far the page reached past the screen.
 * `late`: noted only after the code changed since the round was claimed (or,
 * claimed for an Agent that applied it with no claim, ticket 78, since the
 * page saw it), the code's own breaks may be among those noted.
 */
export interface BreaksNote {
  width: number;
  scrolls: boolean;
  seen: string[];
  over?: Record<string, number>;
  late?: true;
}

declare module "./service-protocol" {
  interface OtherUsagesNote<More = unknown> {
    /** At each width the change is looked at, what breaks of the layout its layer made as the round was claimed (ticket 147); a width it could not be read at is not there. */
    breaks?: BreaksNote[];
  }
}
