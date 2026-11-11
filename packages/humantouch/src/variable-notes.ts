/**
 * The Variables a change's value is, as the change notes tell the Agent: the
 * Variable each part of the value is exactly, and how the code uses it (a
 * Tailwind class, or `var()`); or that no Variable has it, so the exact value
 * goes in, never one close to it.
 */
import type { Bound, Change } from "./client/changeset";
import type { Arrangement } from "./client/property-table";
import { slotsOf } from "./client/variables";
import { propertyName } from "./design-values";

/** The Tailwind class each property is written with, before the Variable's name. */
const PREFIXES: Record<string, string> = {
  fill: "bg",
  textColor: "text",
  stroke: "border",
  gap: "gap",
  rowGap: "gap-y",
  columnGap: "gap-x",
  width: "w",
  height: "h",
  minWidth: "min-w",
  maxWidth: "max-w",
  minHeight: "min-h",
  maxHeight: "max-h",
  radius: "rounded",
  fontSize: "text",
  shadows: "shadow",
  // A shadow's color: Tailwind's shadow color classes.
  textShadows: "text-shadow",
};
const SIDE_PREFIXES: Record<string, string> = { top: "pt", right: "pr", bottom: "pb", left: "pl" };
const CORNER_PREFIXES: Record<string, string> = { "top-left": "rounded-tl", "top-right": "rounded-tr", "bottom-right": "rounded-br", "bottom-left": "rounded-bl" };

/** The **Variables** line of a change, or null for one that has none to tell. */
export function variablesLine(change: Change): string | null {
  const slots = Object.entries(change.variables ?? {});
  if (!slots.length) return null;
  const sentences = slots.map(([slot, bound], i) => {
    const sentence = bound ? named(change, slot, bound) : unnamed(change, slot);
    return i ? sentence[0].toUpperCase() + sentence.slice(1) : sentence;
  });
  return `**Variables:** ${sentences.join(" ")}`;
}

function named(change: Change, slot: string, bound: Bound): string {
  const what = `${partOf(change, slot)} is the Variable \`${bound.name}\``;
  if (bound.from === "css") return `${what}, a CSS variable: use \`${bound.css}\`.`;
  const name = bound.name === "DEFAULT" ? prefixOf(change, slot) : `${prefixOf(change, slot)}-${bound.name}`;
  return `${what}, from the Tailwind theme: use its class, \`${name}\`${bound.css ? ` (in CSS, \`${bound.css}\`)` : ""}.`;
}

function unnamed(change: Change, slot: string): string {
  const drawn = slotsOf(change.property, change.after)[slot]?.drawn;
  let arbitrary = "";
  if (typeof drawn === "number") arbitrary = `: \`${prefixOf(change, slot)}-[${drawn}px]\``;
  // A see-through color: its opacity as Tailwind writes one.
  else if (drawn && !Array.isArray(drawn)) arbitrary = `: \`${prefixOf(change, slot)}-[${drawn.color}]${drawn.opacity < 1 ? `/${Math.round(drawn.opacity * 100)}` : ""}\``;
  return `no Variable has ${partOf(change, slot)}'s value: use the exact value (with Tailwind, an arbitrary value${arbitrary}), not a class or Variable whose value is close.`;
}

/** The part of the value, in a sentence: "the gap", "the top padding", "the fill color", "stop 1 of the fill", "the color of shadow 1". */
function partOf({ property }: Change, slot: string): string {
  // A gap of a Stack's or a Grid's arrangement (ticket 109).
  if (property === "arrangement") return slot === "crossGap" ? "the gap between its lines" : `the ${propertyName(slot)}`;
  const name = propertyName(property);
  if (!slot) return `the ${name}`;
  if (slot === "color") return `the ${name} color`;
  if (slot.startsWith("stop ")) return `${slot} of the ${name}`;
  if (slot.startsWith("shadow ")) return `the color of ${slot}`;
  return `the ${slot} ${name}`;
}

/** The Tailwind class the part is written with, before a value: `bg`, `pt`, `rounded-tl`, `from` for a gradient's first stop. */
function prefixOf({ property, after }: Change, slot: string): string {
  if (slot.startsWith("stop ")) {
    const stops = (after as { stops: unknown[] }).stops.length;
    const n = Number(slot.slice(5));
    return n === 1 ? "from" : n === stops ? "to" : "via";
  }
  if (property === "arrangement") return arrangedGapPrefix(after as Arrangement, slot);
  return SIDE_PREFIXES[slot] ?? CORNER_PREFIXES[slot] ?? PREFIXES[property] ?? property;
}

/** A gap of an arrangement's class: a Grid's row and column gaps, a Stack's gap both unless it wraps, then the gap along it and that between its lines. */
function arrangedGapPrefix(arrangement: Arrangement, slot: string): string {
  if (arrangement.type === "grid") return slot === "rowGap" ? "gap-y" : "gap-x";
  if (!arrangement.wrap) return "gap";
  const along = arrangement.direction === "horizontal" ? "gap-x" : "gap-y";
  return slot === "gap" ? along : along === "gap-x" ? "gap-y" : "gap-x";
}
