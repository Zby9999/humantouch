/**
 * The project's Variables on the canvas: each worked out to what the canvas
 * draws (px, a color, shadows), and which of them a value is. A value is a
 * Variable only when it is exactly that Variable's value: colors compared in
 * sRGB as the canvas draws them, lengths in px. Never one close to it: a
 * close one is only for the panel to hint at (`near`).
 */
import type { Variable, VariableGroup } from "../service-protocol";
import type { Bindings, ChangeSet, Picked } from "./changeset";
import { readShadows, type Shadow } from "./effects";
import { colorReader, type Color, type Fill, type Stroke } from "./paint";
import type { Arrangement, Radius, Size } from "./property-table";

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
  /**
   * The Variable of the group closest to `drawn`, when one is close (see
   * `NEAR`) and none is exactly it: the closest of the project's own when one
   * of them is close, however closer one of Tailwind's defaults is, else the
   * closest default; of two as close, the one listed first. Null otherwise.
   * Only for the panel to hint at: the change notes go by `match` alone.
   */
  near(group: VariableGroup, drawn: Drawn): Resolved | null;
  /** Those of a group whose name has `text` in it, in any case; none for no text. */
  named(group: VariableGroup, text: string): Resolved[];
  /** All of a group, the closest to `drawn` first, of two as close the one listed first; as listed for none, and for shadows. */
  closest(group: VariableGroup, drawn: Drawn | null): Resolved[];
}

/**
 * How close a value is to a Variable for the panel to hint at it, all in one
 * place to tune: a color within `color` of it in OKLab, its opacity within
 * `opacity` of the Variable's (a Variable picked brings its own opacity); a
 * length within `px` of it and within `ratio` of the Variable's own.
 */
export const NEAR = { color: 0.02, opacity: 0.005, px: 2, ratio: 0.1 } as const;

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
  const of = (group: VariableGroup) => groups.get(group) ?? [];
  return {
    of,
    match: (group, drawn) => of(group).find((entry) => equal(entry.drawn, drawn))?.variable ?? null,
    near: (group, drawn) => {
      const entries = of(group);
      if (entries.some((entry) => equal(entry.drawn, drawn))) return null;
      // The project's own first: Tailwind's defaults only when none of its own is close.
      for (const own of [true, false]) {
        let closest: Resolved | null = null;
        let least = Infinity;
        for (const entry of entries) {
          if (entry.variable.own !== own) continue;
          const apart = distance(entry.drawn, drawn);
          if (apart !== null && apart < least) [closest, least] = [entry, apart];
        }
        if (closest) return closest;
      }
      return null;
    },
    named: (group, text) => {
      const part = text.trim().toLowerCase();
      return part ? of(group).filter(({ variable }) => variable.name.toLowerCase().includes(part)) : [];
    },
    closest: (group, drawn) => {
      const entries = of(group);
      if (drawn === null) return entries;
      return entries
        .map((entry, i) => ({ entry, i, apart: apartOf(entry.drawn, drawn) }))
        .sort((a, b) => a.apart - b.apart || a.i - b.i)
        .map(({ entry }) => entry);
    },
  };
}

/** How far `drawn` is from a Variable's value, however far: px for a length, OKLab and opacity for a color; shadows all alike. */
function apartOf(variable: Drawn, drawn: Drawn): number {
  if (typeof variable === "number" && typeof drawn === "number") return Math.abs(variable - drawn);
  if (typeof variable === "number" || typeof drawn === "number" || Array.isArray(variable) || Array.isArray(drawn)) return 0;
  const [a, b] = [oklab(variable.color), oklab(drawn.color)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) + Math.abs(variable.opacity - drawn.opacity);
}

/**
 * How far `drawn` is from a Variable's value, when it is close by `NEAR`:
 * px for a length, the distance in OKLab for a color. Null when not close, or
 * for shadows, which are never hinted at.
 */
function distance(variable: Drawn, drawn: Drawn): number | null {
  if (typeof variable === "number" || typeof drawn === "number") {
    if (typeof variable !== "number" || typeof drawn !== "number") return null;
    const apart = Math.abs(variable - drawn);
    return apart <= NEAR.px && apart <= NEAR.ratio * Math.abs(variable) ? apart : null;
  }
  if (Array.isArray(variable) || Array.isArray(drawn)) return null;
  if (Math.abs(variable.opacity - drawn.opacity) > NEAR.opacity) return null;
  const [a, b] = [oklab(variable.color), oklab(drawn.color)];
  const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return apart <= NEAR.color ? apart : null;
}

/** `#RRGGBB` in OKLab: lightness from 0 to 1, and a and b. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Whether two are the same Variable: by name, from the same place. */
export function sameVariable(a: Variable | null | undefined, b: Variable | null | undefined): boolean {
  return !!a && !!b && a.name === b.name && a.from === b.from;
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

/** The group each property's Variables are in, for those that can be Variables. */
export const GROUPS: Partial<Record<string, VariableGroup>> = {
  gap: "spacing",
  rowGap: "spacing",
  columnGap: "spacing",
  padding: "spacing",
  width: "spacing",
  height: "spacing",
  minWidth: "spacing",
  maxWidth: "spacing",
  minHeight: "spacing",
  maxHeight: "spacing",
  radius: "radius",
  fontSize: "fontSize",
  fill: "color",
  stroke: "color",
  textColor: "color",
  shadows: "shadow",
};

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const colorOf = ({ color, opacity }: Color): Color => ({ color, opacity });

/**
 * The parts of a property's value that can each be a Variable, by name: ""
 * for the whole value, else a side ("top"), a corner, "color", a gradient
 * stop ("stop 1"), a shadow's color ("shadow 1"), a gap of an arrangement
 * ("rowGap", "crossGap", ticket 109). None for a property no
 * Variable is offered for.
 */
export function slotsOf(property: string, value: unknown): Record<string, Slot> {
  const one = (group: VariableGroup, drawn: Drawn): Record<string, Slot> => ({ "": { group, drawn } });
  switch (property) {
    case "gap":
    case "rowGap":
    case "columnGap":
      return one("spacing", value as number);
    case "padding":
      return Object.fromEntries((value as number[]).map((p, i) => [SIDES[i], { group: "spacing", drawn: p }]));
    case "arrangement": {
      // Its gaps, each a part: a Grid's two, a Stack's gap and, wrapping, the gap between its lines.
      const arrangement = value as Arrangement;
      const gaps = arrangement.type === "grid" ? { rowGap: arrangement.rowGap, columnGap: arrangement.columnGap } : { gap: arrangement.gap, ...(arrangement.crossGap !== undefined && { crossGap: arrangement.crossGap }) };
      return Object.fromEntries(Object.entries(gaps).map(([slot, px]) => [slot, { group: "spacing", drawn: px }]));
    }
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
      return (value as Shadow[]).length ? { ...one("shadow", value as Shadow[]), ...shadowColors(value as Shadow[]) } : {};
    case "textShadows":
      return shadowColors(value as Shadow[]);
    default:
      return {};
  }
}

/** The color of each shadow, as a part of its own: "shadow 1", "shadow 2". */
function shadowColors(shadows: Shadow[]): Record<string, Slot> {
  return Object.fromEntries(shadows.map((s, i) => [`shadow ${i + 1}`, { group: "color", drawn: colorOf(s) }]));
}

/**
 * Which Variable each part of a value is, as the change records it. A part the
 * designer picked a Variable for keeps it while the value there is still that
 * Variable's (`picked`; null there: they detached it); any other part is the
 * Variable the code writes it with, when that one draws exactly its value
 * (`code`, ticket 119: of two of the same value, the code's), else the first
 * Variable of its group with exactly its value, or null when none has it.
 * Undefined when no part of the value has a group with Variables.
 */
export function bind(catalog: Catalog, property: string, value: unknown, picked: Picked | undefined, previous: Bindings | undefined, code?: Bindings): Bindings | undefined {
  const bindings: Bindings = {};
  for (const [slot, { group, drawn }] of Object.entries(slotsOf(property, value))) {
    if (!catalog.of(group).length) continue;
    const chosen = picked && slot in picked ? picked[slot] : previous?.[slot]?.picked ? previous[slot] : null;
    const still = chosen && catalog.of(group).find((entry) => sameVariable(entry.variable, chosen));
    if (still && equal(still.drawn, drawn)) bindings[slot] = { ...still.variable, picked: true };
    else {
      const written = !(picked && slot in picked) && code?.[slot];
      const holds = written && catalog.of(group).find((entry) => sameVariable(entry.variable, written));
      bindings[slot] = holds && equal(holds.drawn, drawn) ? holds.variable : catalog.match(group, drawn);
    }
  }
  // Shadows that are a shadow Variable are that Variable, their colors and all, as an effect style is in Figma.
  if (property === "shadows" && bindings[""]) for (const slot of Object.keys(bindings)) if (slot) delete bindings[slot];
  return Object.keys(bindings).length ? bindings : undefined;
}

/**
 * Names the Variables of the style changes recorded before the Variables were
 * in, as `bind` names them as an edit is made: each part of the value the
 * change has, by exact equality. A change that tells its Variables already
 * keeps them. Whether any change was named.
 */
export function bindRecorded(catalog: Catalog, changes: ChangeSet): boolean {
  let named = false;
  for (const change of changes.list()) {
    if (change.kind !== "style" || change.variables) continue;
    const variables = bind(catalog, change.property, change.after, undefined, undefined);
    if (!variables) continue;
    changes.restore({ ...change, variables });
    named = true;
  }
  return named;
}

/** The Variables the designer picked in a change's value, by part: to pick them again when it is undone to. */
export function pickedIn(bindings: Bindings | undefined): Picked | undefined {
  if (!bindings) return undefined;
  const picked = Object.entries(bindings).filter(([, bound]) => bound?.picked);
  return picked.length ? Object.fromEntries(picked.map(([slot, bound]) => [slot, bound])) : undefined;
}

/**
 * The value with part `slot` made what a Variable draws: a side of the
 * padding, a corner, the color of a fill, a stop or a shadow, the shadows as a whole.
 * Null when the value has no such part (a stroke that is none, say).
 */
export function withPart(property: string, value: unknown, slot: string, drawn: Drawn): unknown {
  const px = drawn as number;
  const color = drawn as Color;
  switch (property) {
    case "padding":
      return (value as number[]).map((p, i) => (SIDES[i] === slot ? px : p));
    case "width":
    case "height":
      return { type: "fixed", value: px };
    case "radius": {
      if (!slot) return px;
      const corners = typeof value === "number" ? [value, value, value, value] : (value as number[]);
      const next = corners.map((r, i) => (CORNERS[i] === slot ? px : r));
      return next.every((r) => r === next[0]) ? next[0] : next;
    }
    case "textColor":
      return colorOf(color);
    case "shadows":
    case "textShadows":
      if (!slot) return drawn;
      return (value as Shadow[]).map((s, i) => (`shadow ${i + 1}` === slot ? { ...s, ...colorOf(color) } : s));
    case "stroke":
      return value ? { ...(value as Stroke), ...colorOf(color) } : null;
    case "fill": {
      const fill = value as Fill | null;
      if (slot === "color") return { type: "solid", ...colorOf(color) };
      if (fill?.type !== "linear" && fill?.type !== "radial") return null;
      return { ...fill, stops: fill.stops.map((s, i) => (`stop ${i + 1}` === slot ? { ...s, ...colorOf(color) } : s)) };
    }
    default:
      // A gap, a minimum or maximum, a font size, shadows: the whole value.
      return drawn;
  }
}
