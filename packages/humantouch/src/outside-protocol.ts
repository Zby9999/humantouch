/**
 * What the page notes and says of a change at a breakpoint at the widths
 * outside its range (ticket 104). Apart from `service-protocol.ts`, whose
 * code goes with the toggle the page loads first: the minifier names that
 * code's variables by the text of its files, types and all, so a word more
 * there changes the toggle's bytes.
 */
import type { CheckResult } from "./service-protocol";

/**
 * A width outside the range of a change at a breakpoint where the layer's
 * value of the change's property is not what it was as the round was
 * claimed: its value then (`was`) and now (`is`), in design language.
 */
export interface OutsideChanged {
  width: number;
  was: unknown;
  is: unknown;
}

/** What a layer showed of a change's property at a width outside the change's range, as the round was claimed. */
export interface OutsideNote {
  width: number;
  values: unknown[];
}

declare module "./service-protocol" {
  interface OtherUsagesNote<More = unknown> {
    /**
     * Of a change at a breakpoint: at each width outside its range the page
     * looks at, what the layer showed of the change's property, each of its
     * elements in order; a width it could not be read at is not there.
     */
    outside?: OutsideNote[];
  }
}

/**
 * A check's result where the layer shows a change at a breakpoint, but widths
 * outside its range show its property otherwise than as the round was
 * claimed (`outside`); `actual` is then the layer's own value.
 */
export type NotShownOutside = Extract<CheckResult, { outcome: "not shown" }> & { outside?: OutsideChanged[] };

/** The widths outside its range a check found a change at a breakpoint shown at too, if it did. */
export function outsideIn(result: CheckResult | undefined): OutsideChanged[] | undefined {
  return result?.outcome === "not shown" ? (result as NotShownOutside).outside : undefined;
}
