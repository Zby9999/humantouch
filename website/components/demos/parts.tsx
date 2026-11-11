/** The pointer the demos draw, as Figma draws one. */

/**
 * The pointer, as Figma draws one: a triangle leaning to its tip, its inner corner drawn in, every corner rounded; dark,
 * edged in white. Its tip is at TIP in its 20px box.
 */
export const TIP = { x: 3.5, y: 3 };
const POINTER = "M3.5 3 L17 8.6 L10.6 10.6 L8.6 17 Z";
export function PointerShape() {
  return (
    <>
      <path d={POINTER} fill="#fff" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      <path d={POINTER} fill="#0a0a09" stroke="#0a0a09" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  );
}
