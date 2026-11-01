import { afterEach, describe, expect, test } from "vitest";
import { holdPointer, pointerHeld } from "../src/client/pointer-held";

/** The pointer `pointerId` let go, or cancelled, on something on the page. */
function lift(type: "pointerup" | "pointercancel", pointerId: number) {
  const on = document.createElement("div");
  document.body.append(on);
  on.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true, composed: true }));
  on.remove();
}

describe("a press held down", () => {
  const releases: (() => void)[] = [];
  const hold = (pointerId: number) => {
    const release = holdPointer(pointerId);
    releases.push(release);
    return release;
  };
  afterEach(() => releases.splice(0).forEach((release) => release()));

  test("is held from when it is pressed until that pointer is let go", () => {
    expect(pointerHeld()).toBe(false);
    hold(1);
    expect(pointerHeld()).toBe(true);
    // Another pointer let go leaves it held.
    lift("pointerup", 2);
    expect(pointerHeld()).toBe(true);
    lift("pointerup", 1);
    expect(pointerHeld()).toBe(false);
  });

  test("ends as the pointer is cancelled", () => {
    hold(1);
    lift("pointercancel", 1);
    expect(pointerHeld()).toBe(false);
  });

  test("ends sooner when released, as a drag cancelled with Esc is, and released again does nothing more", () => {
    const release = hold(1);
    const other = hold(2);
    release();
    expect(pointerHeld()).toBe(true);
    release();
    expect(pointerHeld()).toBe(true);
    other();
    expect(pointerHeld()).toBe(false);
  });

  test("held twice by the same pointer, as a drag over a value's icon and its field could be, both end as it is let go", () => {
    hold(1);
    hold(1);
    lift("pointerup", 1);
    expect(pointerHeld()).toBe(false);
  });
});
