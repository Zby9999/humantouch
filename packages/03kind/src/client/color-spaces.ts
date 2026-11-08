/**
 * A color as the color picker reads and sets it: the hex the change set keeps
 * (`#RRGGBB`, sRGB), and the same color as RGB, HSB (the picker's square and
 * hue), HSL and OKLCH. An OKLCH color outside sRGB comes back in it with less
 * chroma, the lightness and hue kept, as the change set has no wider colors.
 */

/** 0–255 each. */
export type Rgb = [number, number, number];
/** Hue 0–360, saturation and brightness 0–1. */
export interface Hsb {
  h: number;
  s: number;
  b: number;
}
/** Hue 0–360, saturation and lightness 0–1. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}
/** Lightness 0–1, chroma from 0 (about 0.37 at most in sRGB), hue 0–360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function rgbToHsb([r, g, b]: Rgb): Hsb {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  return { h: hueOf(R, G, B, max, d), s: max ? d / max : 0, b: max };
}

export function hsbToRgb({ h, s, b }: Hsb): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return b - b * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  return { h: hueOf(R, G, B, max, d), s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function hueOf(R: number, G: number, B: number, max: number, d: number): number {
  if (!d) return 0;
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map((n) => toLinear(n / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  // A gray has no hue: 0, as CSS reads it.
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** The color in linear sRGB, which may be outside 0–1. */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (linear: number[]) => linear.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** Whether the color is in sRGB as it is, its chroma not cut. */
export function oklchInSrgb(color: Oklch): boolean {
  return inGamut(oklchToLinear(color));
}

/** The color in sRGB: outside it, with its chroma cut till it is in, lightness and hue kept. */
export function oklchToRgb(color: Oklch): Rgb {
  let linear = oklchToLinear(color);
  if (!inGamut(linear)) {
    let [low, high] = [0, color.c];
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) low = mid;
      else high = mid;
    }
    linear = oklchToLinear({ ...color, c: low });
  }
  return linear.map((c) => fromLinear(Math.min(1, Math.max(0, c))) * 255) as Rgb;
}
