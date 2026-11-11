import type { Property } from "./property-table";

/**
 * Properties that change together at a breakpoint, and so go back together,
 * whichever field's reset takes one back (`ChangeMarks`): a layer placed from
 * its container's right or bottom edge has that changed with its size
 * (ticket 75), and its size reset alone, or that alone, would leave it
 * elsewhere (line review). Its `right` or `bottom` changed by a move as well
 * (ticket 79) goes back too.
 */
const RESET_TOGETHER: [Property, Property][] = [
  ["width", "right"],
  ["height", "bottom"],
];

/** What changes together with `property` at a breakpoint (`RESET_TOGETHER`). */
export const togetherWith = (property: Property) => RESET_TOGETHER.flatMap((pair) => (pair.includes(property) ? pair.filter((other) => other !== property) : []));
