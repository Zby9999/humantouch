/**
 * The page's CSS that answers to the window's size, rewritten for the canvas
 * (ADR 0008). A view stands for a window as wide as it, and as tall as the
 * window the page was frozen in; but each view's iframe is as tall as the
 * whole page. So what answers to the width is left to the iframe, the same in
 * every view; what answers to the height is settled now, against the height
 * the designer had. Nothing here differs from one view to another: views
 * differ only by the width of their iframe.
 */

/** The window the page was frozen in. */
export interface FrozenWindow {
  /** Its height, px. */
  height: number;
  /** How much of its width its scrollbar took, px: the page was laid out that much narrower than the window. */
  scrollbar: number;
  /** Whether a media query held in it. */
  matches(query: string): boolean;
}

/** A media condition that always holds, and one that never does, in any view. */
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

/** What answers to the window's size in a media query: a feature on its size. */
export const VIEWPORT_MEDIA = /width|height|aspect-ratio|orientation/i;
/** A media feature with nothing nested in it: `(name: value)`, `(name)` or a range. */
const FEATURE = /\(([^()]*)\)/g;
const PLAIN = /^\s*([a-z-]+)\s*(?::\s*([^]*?))?\s*$/i;
const COMPARISON = /(<=|>=|<|>|=)/;
const LENGTH = /(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z]+)/gi;

/**
 * `query` with every feature on the window's size made one on its width
 * alone, or settled: it holds in a view as it held in a window that wide and
 * as tall as `frozen`.
 */
export function mediaForViews(query: string, frozen: FrozenWindow): string {
  return query.replace(FEATURE, (feature, inside: string) => {
    if (!VIEWPORT_MEDIA.test(inside)) return feature;
    const plain = PLAIN.exec(inside);
    const name = (plain ? plain[1] : inside.split(COMPARISON).find((part) => /^\s*[a-z-]+\s*$/i.test(part)) ?? "").trim().toLowerCase();
    if (name === "width" || name === "min-width" || name === "max-width") return frozen.scrollbar ? feature.replace(LENGTH, (length) => `calc(${length} - ${frozen.scrollbar}px)`) : feature;
    // The window's width is the view's and the scrollbar's: the width up to which it is as tall as wide, or taller.
    const square = frozen.height - frozen.scrollbar;
    if (name === "orientation" && plain?.[2]) {
      const value = plain[2].toLowerCase();
      if (value === "portrait") return `(width <= ${square}px)`;
      if (value === "landscape") return `(width > ${square}px)`;
    }
    if (/^(min-|max-)?aspect-ratio$/.test(name) && plain?.[2]) {
      const [w, h = 1] = plain[2].split("/").map(Number);
      const at = (frozen.height * w) / h - frozen.scrollbar;
      if (Number.isFinite(at)) return `(width ${name.startsWith("min") ? ">=" : name.startsWith("max") ? "<=" : "="} ${round(at)}px)`;
    }
    if (name.startsWith("device-") || name.startsWith("min-device-") || name.startsWith("max-device-")) return feature;
    // On the height alone, or not to be put as one on the width: as it was in the window.
    return frozen.matches(feature) ? ALWAYS : NEVER;
  });
}

/** A length in a viewport unit; not in a word or a hex color. */
const VIEWPORT_UNIT = /(?<![\w#.-])(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([sld]?)(vh|vw|vmin|vmax|vi|vb)\b/gi;
export const HAS_VIEWPORT_UNIT = new RegExp(VIEWPORT_UNIT.source, "i");
/** `url()`s and strings are left alone. */
const LITERALS = /(url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

/**
 * `value` with lengths in viewport units on the height settled to px, and
 * those on the width left to each view, the scrollbar the window had added.
 */
export function unitsForViews(value: string, frozen: FrozenWindow): string {
  const across = (n: number, unit: string) =>
    frozen.scrollbar ? `calc(${n}${unit} + ${round((n * frozen.scrollbar) / 100)}px)` : `${n}${unit}`;
  const down = (n: number) => `${round((n * frozen.height) / 100)}px`;
  return value
    .split(LITERALS)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(VIEWPORT_UNIT, (_, number: string, prefix: string, unit: string) => {
            const n = Number(number);
            switch (unit.toLowerCase()) {
              case "vh":
              case "vb":
                return down(n);
              case "vw":
              case "vi":
                return across(n, `${prefix}vw`);
              case "vmin":
                return `min(${across(n, `${prefix}vw`)}, ${down(n)})`;
              default:
                return `max(${across(n, `${prefix}vw`)}, ${down(n)})`;
            }
          }),
    )
    .join("");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
