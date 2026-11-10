/**
 * The Variables the code gives a layer's values (ticket 119): for each part of
 * a value that can be a Variable, the Variable the declaration winning the
 * cascade there writes it with, in the view it is read in (ADR 0008). A
 * Tailwind v4 theme class and a CSS rule both write it as `var()` (the
 * spacing scale as `calc(var(--spacing) * 4)`); a Tailwind v3 class writes the
 * value itself, so the class names it (`bg-brand-2`). A part is the Variable
 * only when that Variable draws exactly the value shown there now: whatever is
 * not read so (a value written as is, inherited, mixed with another, of a
 * stylesheet the project's Variables are not of) is no Variable of the code's.
 * Only read, on selection: nothing here records a change.
 */
import type { Variable, VariableGroup } from "../service-protocol";
import type { Bindings } from "./changeset";
import type { Property } from "./property-table";
import { winnersAmong } from "./style-source";
import { equal, slotsOf, type Catalog } from "./variables";

/** Where a part of a value is set: CSS properties that set the same, the winner among them taken. */
interface Place {
  properties: string[];
  /** The value's place in a shorthand of four (`padding: 1px 2px`): top, right, bottom, left; or corners from the top left. */
  four?: number;
  /** In a shorthand of two (`padding-inline`, `gap`): start or end, row or column. */
  two?: 0 | 1;
}

/** A part of a value: the places that must all give it the same Variable (a stroke's four sides), and the classes that name it. */
interface Part {
  places: Place[];
  /** A Tailwind class for the part: its Variable's name the first group, none for `DEFAULT` (`rounded`). */
  classes: RegExp;
}

const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const ROUNDED = /^rounded(?:-(?:tl|tr|br|bl|ss|se|es|ee|t|r|b|l|s|e))?(?:-(.+))?$/;
const PADDED = /^p[trblxyse]?-(.+)$/;

/** The parts of `property` that can be read, on `el` as it is laid out now. */
function partsOf(el: Element, property: Property): Record<string, Part> | null {
  const style = getComputedStyle(el);
  const rtl = style.direction === "rtl";
  const one = (properties: string[], classes: RegExp, two?: 0 | 1): Record<string, Part> => ({ "": { places: [{ properties, two }], classes } });
  switch (property) {
    case "fill":
      return { color: { places: [{ properties: ["background-color"] }], classes: /^bg-(.+)$/ } };
    case "textColor":
      return one(["color"], /^text-(.+)$/);
    case "stroke":
      return { color: { places: SIDES.map((side, i) => ({ properties: [`border-${side}-color`], four: i })), classes: /^border(?:-[trblxyse])?-(.+)$/ } };
    case "fontSize":
      return one(["font-size"], /^text-(.+)$/);
    case "shadows":
      return one(["box-shadow"], /^shadow(?:-(.+))?$/);
    case "gap":
      return style.flexDirection.startsWith("row") ? one(["column-gap"], /^gap(?:-x)?-(.+)$/, 1) : one(["row-gap"], /^gap(?:-y)?-(.+)$/, 0);
    case "rowGap":
      return one(["row-gap"], /^gap(?:-y)?-(.+)$/, 0);
    case "columnGap":
      return one(["column-gap"], /^gap(?:-x)?-(.+)$/, 1);
    case "width":
      return one(["width"], /^w-(.+)$/);
    case "height":
      return one(["height"], /^h-(.+)$/);
    case "minWidth":
      return one(["min-width"], /^min-w-(.+)$/);
    case "maxWidth":
      return one(["max-width"], /^max-w-(.+)$/);
    case "minHeight":
      return one(["min-height"], /^min-h-(.+)$/);
    case "maxHeight":
      return one(["max-height"], /^max-h-(.+)$/);
    case "padding": {
      const inline = rtl ? ["end", "start"] : ["start", "end"];
      const logical: Record<string, [string, 0 | 1]> = { top: ["block-start", 0], bottom: ["block-end", 1], left: [`inline-${inline[0]}`, 0], right: [`inline-${inline[1]}`, 1] };
      return Object.fromEntries(
        SIDES.map((side, i) => {
          const [longhand, two] = logical[side];
          const axis = longhand.slice(0, longhand.indexOf("-"));
          return [side, { places: [{ properties: [`padding-${side}`, `padding-${longhand}`, `padding-${axis}`], four: i, two }], classes: PADDED }];
        }),
      );
    }
    case "radius": {
      // The corner each is at the start or the end of, block then inline.
      const logical = rtl ? ["start-end", "start-start", "end-start", "end-end"] : ["start-start", "start-end", "end-end", "end-start"];
      const corners = CORNERS.map((corner, i): Place => ({ properties: [`border-${corner}-radius`, `border-${logical[i]}-radius`], four: i }));
      return { "": { places: corners, classes: ROUNDED }, ...Object.fromEntries(CORNERS.map((corner, i) => [corner, { places: [corners[i]], classes: ROUNDED }])) };
    }
    default:
      return null;
  }
}

/** Per element, the winning declaration of each list of properties read so far: the page's own styles stay as they are while it is edited. */
const read = new WeakMap<Element, Map<string, { declaration: string; className: string | null } | null>>();

/** Every property read: an element's first read reads them all, with one walk of the cascade. */
const READ: Property[] = ["fill", "textColor", "stroke", "fontSize", "shadows", "rowGap", "columnGap", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "padding", "radius"];

function winners(el: Element, places: Place[]): ({ declaration: string; className: string | null } | null)[] {
  let known = read.get(el);
  if (!known) read.set(el, (known = new Map()));
  const keyOf = (place: Place) => place.properties.join(" ");
  const all = known.size ? places : [...places, ...READ.flatMap((property) => Object.values(partsOf(el, property) ?? {}).flatMap((part) => part.places))];
  const unread = [...new Set(all.map(keyOf))].filter((key) => !known!.has(key));
  if (unread.length) {
    const found = winnersAmong(el, unread.map((key) => key.split(" ")));
    unread.forEach((key, i) => known!.set(key, found[i]));
  }
  return places.map((place) => known!.get(keyOf(place)) ?? null);
}

/**
 * Which Variable the code gives each part of `property` of `el`, the element
 * as the view it is read in lays it out, whose value is `value` now: only
 * those parts the code gives a Variable that draws exactly the part's value.
 * Undefined when it gives none.
 */
export function variablesInCode(catalog: Catalog, el: Element, property: Property, value: unknown): Bindings | undefined {
  const slots = slotsOf(property, value);
  if (!Object.keys(slots).length) return undefined;
  // Its own rules alone: a text style inherited from a layer above is not the layer's own Variable.
  const parts = partsOf(el, property);
  if (!parts) return undefined;
  const found: Bindings = {};
  for (const [slot, { group, drawn }] of Object.entries(slots)) {
    const part = parts[slot];
    if (!part || !catalog.of(group).length) continue;
    const variables = winners(el, part.places).map((winner, i) => (winner ? variableOf(catalog, group, winner, part.places[i], part.classes) : null));
    const [first] = variables;
    if (!first || variables.some((v) => v !== first)) continue;
    const entry = catalog.of(group).find((e) => e.variable === first);
    if (entry && equal(entry.drawn, drawn)) found[slot] = first;
  }
  return Object.keys(found).length ? found : undefined;
}

/** The Variable a winning declaration writes its part with: through `var()` when it is so written, else as its class names it. */
function variableOf(catalog: Catalog, group: VariableGroup, { declaration, className }: { declaration: string; className: string | null }, place: Place, classes: RegExp): Variable | null {
  const colon = declaration.indexOf(":");
  const name = declaration.slice(0, colon).trim();
  const token = tokenOf(name, declaration.slice(colon + 1).trim(), place, group === "color");
  const entries = catalog.of(group);
  const css = token === null ? null : written(token);
  // Written through one of the project's Variables, or one it does not know of: then none.
  if (css) return entries.find(({ variable }) => variable.css !== undefined && written(variable.css) === css)?.variable ?? null;
  // A Tailwind class the rule is: in Tailwind v3 its value is written out (`hsl(var(--primary) / 1)` too), the class names the Variable.
  const bare = className?.replace(/^.*:(?![^[]*\])/, "").replace(/^!|!$/g, "");
  const named = bare ? classes.exec(bare) : null;
  if (!named) return null;
  const variable = named[1] ?? "DEFAULT";
  return entries.find((entry) => entry.variable.from === "tailwind" && entry.variable.name === variable)?.variable ?? null;
}

/**
 * The part of a declared value at `place`: the whole of a single value, the
 * place's own of a shorthand of four or two, or a color's of a shorthand that
 * has one `var()` among its values (`border: 1px solid var(--line)`). Null
 * when it cannot be told.
 */
function tokenOf(name: string, value: string, place: Place, color: boolean): string | null {
  const tokens = topLevelWords(value.replace(/\s*!important$/, ""));
  if (tokens.length === 1) return tokens[0];
  if (color) {
    const vars = tokens.filter((token) => token.startsWith("var("));
    if (vars.length === 1 && !/^border(-(top|right|bottom|left))?-color$|^border-color$/.test(name)) return vars[0];
  }
  if (tokens.some((token) => token === "/")) return null;
  if (place.four !== undefined && (name === "padding" || name === "border-radius" || name === "border-color") && tokens.length <= 4) {
    const at = [[0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 2, 1], [0, 1, 2, 3]][tokens.length - 1][place.four];
    return tokens[at];
  }
  if (place.two !== undefined && tokens.length === 2 && /^(padding-(inline|block)|gap)$/.test(name)) return tokens[place.two];
  return null;
}

/** A value as written, without a fallback or spaces that do not matter: `var(--a, red)` is `var(--a)`. */
function written(css: string): string | null {
  const plain = css.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const one = /^var\((--[\w-]+)\s*(?:,.*)?\)$/.exec(plain);
  if (one) return `var(${one[1]})`;
  return /^calc\(var\(--spacing\) \* [\d.]+\)$/.test(plain) ? plain : null;
}

/** Splits a value at its top-level spaces. */
function topLevelWords(value: string): string[] {
  const words: string[] = [];
  let depth = 0;
  let word = "";
  for (const c of value) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (/\s/.test(c) && depth === 0) {
      if (word) words.push(word);
      word = "";
    } else word += c;
  }
  return word ? [...words, word] : words;
}
