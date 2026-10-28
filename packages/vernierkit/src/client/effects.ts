/**
 * Effects in design language, read from and written as CSS: drop and inner
 * shadows are a layer's box shadows, a layer blur its filter's blur, a
 * background blur its backdrop filter's blur.
 */
import { cssColor, split, type Color, type ColorReader } from "./paint";

/**
 * A drop shadow, or an inner shadow (inset): offset `x` and `y`, `blur` and
 * `spread` in px, as CSS draws a box shadow. A layer's shadows go first on top.
 */
export interface Shadow extends Color {
  type: "drop" | "inner";
  x: number;
  y: number;
  blur: number;
  spread: number;
}

/** A shadow, its fields in the order the editor reads them back in: a change is told from no change by comparing them as written. */
export function shadow({ type, x, y, blur, spread, color, opacity }: Shadow): Shadow {
  return { type, x, y, blur, spread, color, opacity };
}

/**
 * Whether the shadow draws anything: one with no offset, blur or spread does
 * not, whatever its color, as a stroke of weight 0 is none.
 */
export function draws({ x, y, blur, spread }: Shadow): boolean {
  return Boolean(x || y || blur || spread);
}

/**
 * The layer's shadows, first on top. Shadows that draw nothing (Tailwind's
 * `0 0 #0000`, and a ring's `0 0 0 0px #fff` offset, there to compose with) are left out.
 */
export function readShadows(el: Element, colors: ColorReader): Shadow[] {
  const css = getComputedStyle(el).boxShadow;
  if (css === "none") return [];
  return split(css, ",").flatMap((one) => {
    const tokens = split(one, " ");
    const lengths = tokens.filter((token) => LENGTH.test(token)).map(parseFloat);
    const color = colors.color(tokens.filter((token) => token !== "inset" && !LENGTH.test(token)).join(" ") || "currentcolor");
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    const read = shadow({ type: tokens.includes("inset") ? "inner" : "drop", x, y, blur, spread, ...color });
    return draws(read) ? [read] : [];
  });
}

const LENGTH = /^-?(\d*\.)?\d+(px)?$/;

/** The CSS that draws the shadows; none takes them off. */
export function writeShadows(shadows: Shadow[]): Record<string, string> {
  const css = shadows.map((s) => `${s.type === "inner" ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${cssColor(s)}`);
  return { "box-shadow": css.length ? css.join(", ") : "none" };
}

/** A blur in px, as CSS draws `blur()`; null for none. */
export type Blur = number | null;

const BLUR = /^blur\((.*)\)$/;

/**
 * A blur kept in a filter: `filter` blurs the layer (a layer blur),
 * `backdrop-filter` what is behind it (a background blur). The filter's other
 * functions stay as they are, and where they are.
 */
export function blur(property: "filter" | "backdrop-filter") {
  const functions = (el: Element) => {
    const css = getComputedStyle(el).getPropertyValue(property);
    return css === "none" ? [] : split(css, " ");
  };
  return {
    /** A filter that blurs more than once cannot be read as one blur. */
    applies: (el: Element) => functions(el).filter((f) => BLUR.test(f)).length <= 1,
    read(el: Element): Blur {
      const found = functions(el).map((f) => BLUR.exec(f)).find(Boolean);
      return found ? parseFloat(found[1]) || 0 : null;
    },
    write(value: Blur, el: Element): Record<string, string> {
      const now = functions(el);
      const at = now.findIndex((f) => BLUR.test(f));
      const next = value === null ? now.filter((_, i) => i !== at) : at < 0 ? [...now, `blur(${value}px)`] : now.map((f, i) => (i === at ? `blur(${value}px)` : f));
      return { [property]: next.length ? next.join(" ") : "none" };
    },
    writes: [property],
    sets: [property],
  };
}
