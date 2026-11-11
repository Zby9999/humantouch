import { describe, expect, test } from "vitest";
import { hexToRgb, hsbToRgb, hslToRgb, oklchInSrgb, oklchToRgb, rgbToHex, rgbToHsb, rgbToHsl, rgbToOklch } from "../src/client/color-spaces";

const HEXES = ["#000000", "#FFFFFF", "#2440C4", "#3D63F5", "#FF0000", "#00FF00", "#808080", "#FEF2F2", "#1B1D2A"];

describe("the color picker's color spaces", () => {
  test("each color goes to RGB, HSB, HSL and OKLCH and back to the same hex", () => {
    for (const hex of HEXES) {
      const rgb = hexToRgb(hex);
      expect(rgbToHex(rgb)).toBe(hex);
      expect(rgbToHex(hsbToRgb(rgbToHsb(rgb)))).toBe(hex);
      expect(rgbToHex(hslToRgb(rgbToHsl(rgb)))).toBe(hex);
      expect(rgbToHex(oklchToRgb(rgbToOklch(rgb)))).toBe(hex);
    }
  });

  test("OKLCH reads as CSS does: white at lightness 1, a gray with no chroma and hue 0, sRGB red at about 0.628 0.258 29", () => {
    expect(rgbToOklch([255, 255, 255]).l).toBeCloseTo(1, 3);
    const gray = rgbToOklch([128, 128, 128]);
    expect(gray.c).toBeCloseTo(0, 3);
    expect(gray.h).toBe(0);
    const red = rgbToOklch([255, 0, 0]);
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });

  test("an OKLCH color outside sRGB comes back in it, its chroma cut, its lightness and hue kept", () => {
    const wide = { l: 0.7, c: 0.37, h: 145 };
    expect(oklchInSrgb(wide)).toBe(false);
    const back = rgbToOklch(oklchToRgb(wide));
    expect(back.l).toBeCloseTo(0.7, 2);
    expect(back.h).toBeCloseTo(145, 0);
    expect(back.c).toBeLessThan(0.37);
    expect(oklchInSrgb(back)).toBe(true);
  });

  test("HSB and HSL read hue, saturation and brightness or lightness as Figma shows them", () => {
    expect(rgbToHsb([36, 64, 196])).toEqual({ h: expect.closeTo(229.5, 0), s: expect.closeTo(0.816, 2), b: expect.closeTo(0.769, 2) });
    expect(rgbToHsl([36, 64, 196])).toEqual({ h: expect.closeTo(229.5, 0), s: expect.closeTo(0.69, 2), l: expect.closeTo(0.455, 2) });
  });
});
