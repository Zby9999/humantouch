/**
 * The project's Variables on the canvas: each worked out to what the canvas
 * draws (px, a color, shadows), and which of them a value is. A value is a
 * Variable only when it is exactly that Variable's value: colors compared in
 * sRGB as the canvas draws them, lengths in px. Never one close to it.
 */
import type { Variable, VariableGroup } from "../service-protocol";
import type { Bindings, Picked } from "./changeset";
import { readShadows, type Shadow } from "./effects";
import { colorReader, type Color, type Fill, type Stroke } from "./paint";
import type { Radius, Size } from "./edits";

/** What a Variable comes to on the canvas: px for a length, a color, or shadows. */
export type Drawn = number | Color | Shadow[];

/** A Variable and what it comes to on the canvas. */
export interface Resolved {
  variable: Variable;
  drawn: Drawn;
}

/** The project's Variables, in the order the panel lists them: the project's own first. */
export interface Catalog {
  /** Those of a group. */
  of(group: VariableGroup): Resolved[];
  /** The first Variable of the group whose value is exactly `drawn`, or null. */
  match(group: VariableGroup, drawn: Drawn): Variable | null;
}

/**
 * The Variables worked out on the canvas's document, so a rem is the page's
 * rem. One that does not come to a length, a color or shadows there is left out.
 */
export function resolveVariables(variables: Variable[], doc: Document): Catalog {
  const probe = doc.createElement("div");
  probe.style.cssText = "position: absolute; visibility: hidden; pointer-events: none";
  doc.body.append(probe);
  const colors = colorReader(doc);
  const supports = (property: string, value: string) => doc.defaultView!.CSS.supports(property, value);
  const resolved: Resolved[] = [];
  try {
    for (const variable of variables) {
      const { group, value } = variable;
      let drawn: Drawn | null = null;
      if (group === "color") drawn = supports("color", value) ? colors.color(value) : null;
      else if (group === "shadow") {
        probe.style.boxShadow = "";
        probe.style.boxShadow = value;
        drawn = probe.style.boxShadow ? readShadows(probe, colors) : null;
        if (drawn && !drawn.length) drawn = null;
      } else {
        // A margin takes any length, below 0 too.
        probe.style.marginLeft = "";
        probe.style.marginLeft = value;
        drawn = probe.style.marginLeft ? rounded(parseFloat(getComputedStyle(probe).marginLeft)) : null;
      }
      if (drawn !== null) resolved.push({ variable, drawn });
    }
  } finally {
    probe.remove();
  }
  const groups = new Map<VariableGroup, Resolved[]>();
  for (const entry of resolved) groups.set(entry.variable.group, [...(groups.get(entry.variable.group) ?? []), entry]);
  return {
    of: (group) => groups.get(group) ?? [],
    match: (group, drawn) => groups.get(group)?.find((entry) => equal(entry.drawn, drawn))?.variable ?? null,
  };
}

/** Whether two drawn values are the same: lengths to a hundredth of a px, colors and shadows exactly. */
export function equal(a: Drawn, b: Drawn): boolean {
  if (typeof a === "number" || typeof b === "number") return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;
  return JSON.stringify(a) === JSON.stringify(b);
}

function rounded(px: number): number {
  return Math.round(px * 100) / 100;
}

/** A part of a property's value a Variable can be: its group, and what it is drawn as. */
export interface Slot {
  group: VariableGroup;
  drawn: Drawn;
}

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const colorOf = ({ color, opacity }: Color): Color => ({ color, opacity });

/**
 * The parts of a property's value that can each be a Variable, by name: ""
 * for the whole value, else a side ("top"), a corner, "color", a gradient
 * stop ("stop 1"). None for a property no Variable is offered for.
 */
export function slotsOf(property: string, value: unknown): Record<string, Slot> {
  const one = (group: VariableGroup, drawn: Drawn): Record<string, Slot> => ({ "": { group, drawn } });
  switch (property) {
    case "gap":
      return one("spacing", value as number);
    case "padding":
      return Object.fromEntries((value as number[]).map((p, i) => [SIDES[i], { group: "spacing", drawn: p }]));
    case "width":
    case "height":
      return (value as Size).type === "fixed" ? one("spacing", (value as { value: number }).value) : {};
    case "minWidth":
    case "maxWidth":
    case "minHeight":
    case "maxHeight":
      return value === null ? {} : one("spacing", value as number);
    case "radius":
      return typeof value === "number" ? one("radius", value) : Object.fromEntries((value as Exclude<Radius, number>).map((r, i) => [CORNERS[i], { group: "radius", drawn: r }]));
    case "fontSize":
      return one("fontSize", value as number);
    case "textColor":
      return one("color", colorOf(value as Color));
    case "stroke":
      return value ? { color: { group: "color", drawn: colorOf(value as Stroke) } } : {};
    case "fill": {
      const fill = value as Fill | null;
      if (fill?.type === "solid") return { color: { group: "color", drawn: colorOf(fill) } };
      if (fill?.type === "linear" || fill?.type === "radial") return Object.fromEntries(fill.stops.map((s, i) => [`stop ${i + 1}`, { group: "color", drawn: colorOf(s) }]));
      return {};
    }
    case "shadows":
      return (value as Shadow[]).length ? one("shadow", value as Shadow[]) : {};
    default:
      return {};
  }
}

/**
 * Which Variable each part of a value is, as the change records it. A part the
 * designer picked a Variable for keeps it while the value there is still that
 * Variable's (`picked`; null there: they detached it); any other part is the
 * first Variable of its group with exactly its value, or null when none has it.
 * Undefined when no part of the value has a group with Variables.
 */
export function bind(catalog: Catalog, property: string, value: unknown, picked: Picked | undefined, previous: Bindings | undefined): Bindings | undefined {
  const bindings: Bindings = {};
  for (const [slot, { group, drawn }] of Object.entries(slotsOf(property, value))) {
    if (!catalog.of(group).length) continue;
    const chosen = picked && slot in picked ? picked[slot] : previous?.[slot]?.picked ? previous[slot] : null;
    const still = chosen && catalog.of(group).find((entry) => entry.variable.name === chosen.name && entry.variable.from === chosen.from);
    if (still && equal(still.drawn, drawn)) bindings[slot] = { ...still.variable, picked: true };
    else bindings[slot] = catalog.match(group, drawn);
  }
  return Object.keys(bindings).length ? bindings : undefined;
}

/** The Variables the designer picked in a change's value, by part: to pick them again when it is undone to. */
export function pickedIn(bindings: Bindings | undefined): Picked | undefined {
  if (!bindings) return undefined;
  const picked = Object.entries(bindings).filter(([, bound]) => bound?.picked);
  return picked.length ? Object.fromEntries(picked.map(([slot, bound]) => [slot, bound])) : undefined;
}
