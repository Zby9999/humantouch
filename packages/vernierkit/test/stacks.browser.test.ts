import { afterEach, describe, expect, test } from "vitest";
import { insideBorder, paddingBox } from "../src/client/stacks";

const made: Element[] = [];
afterEach(() => {
  for (const el of made.splice(0)) el.remove();
});

function frame(style: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `position: absolute; left: 30px; top: 40px; width: 200px; height: 100px; border-style: solid; ${style}`;
  document.body.append(el);
  made.push(el);
  return el;
}

/** Where an absolute layer at 0, 0 in `el` is. */
function origin(el: Element): [number, number] {
  const layer = document.createElement("div");
  layer.style.cssText = "position: absolute; left: 0; top: 0; width: 1px; height: 1px";
  el.append(layer);
  const { left, top } = layer.getBoundingClientRect();
  layer.remove();
  return [left, top];
}

describe("a Frame's box inside its border, where its absolute layers are placed", () => {
  test("is where an absolute layer at 0, 0 is; measured either way, the same, with a border in whole px and no scrollbar", () => {
    const el = frame("border-width: 3px 7px 5px 11px; padding: 4px");
    const client = paddingBox(el);
    const exact = insideBorder(el, el.getBoundingClientRect());
    expect([client.left, client.top]).toEqual(origin(el));
    expect([exact.left, exact.top, exact.right, exact.bottom]).toEqual([client.left, client.top, client.right, client.bottom]);
  });

  test("goes by the border box it is given, as laid out before anything shifted, the same inside it", () => {
    const el = frame("border-width: 2px");
    const r = el.getBoundingClientRect();
    const now = insideBorder(el, r);
    const then = insideBorder(el, new DOMRect(r.left - 50, r.top + 20, r.width, r.height));
    expect([then.left - now.left, then.top - now.top, then.width, then.height]).toEqual([-50, 20, now.width, now.height]);
  });

  test("measured to snap to, keeps the fraction of a px a Frame is laid out at", () => {
    const el = frame("border-width: 1px; width: 200.5px; left: 30.25px");
    const r = el.getBoundingClientRect();
    const exact = insideBorder(el, r);
    expect(exact.left).toBeCloseTo(r.left + 1, 5);
    expect(exact.width).toBeCloseTo(r.width - 2, 5);
  });

  test("as the browser places layers, leaves out a scrollbar; measured to snap to, takes it in", () => {
    const el = frame("border-width: 2px; overflow: scroll");
    const client = paddingBox(el);
    const exact = insideBorder(el, el.getBoundingClientRect());
    expect([client.left, client.top]).toEqual([exact.left, exact.top]);
    expect(exact.right - client.right).toBe(el.offsetWidth - el.clientWidth - 4);
  });
});
