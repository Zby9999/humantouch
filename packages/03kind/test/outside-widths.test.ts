import { describe, expect, test } from "vitest";
import type { Change } from "../src/client/changeset";
import { outsideOf } from "../src/client/check";

/**
 * Ticket 104: a change at a breakpoint applies in its range alone (ADR 0008):
 * the widths outside it the page looks at for the layer to show the change's
 * property as it did, the window's and each view's, but where the round
 * changes the property of the layer otherwise.
 */
describe("the widths outside a breakpoint's range the page looks at", () => {
  const PHONE = { min: null, max: 768, project: { tailwind: "max-md:" } };
  const TABLET = { min: 768, max: 1024, project: { tailwind: "md:max-lg:" } };
  const card = { loc: "src/components/Card.tsx:3:5", chain: [{ component: "Card", usage: "src/App.tsx:39:11", thirdParty: false }] } as Change["target"];
  const fourth = { loc: card.loc, chain: [{ component: "Card", usage: "src/App.tsx:42:9", thirdParty: false }] } as Change["target"];
  let id = 0;
  const style = (more: Partial<Change>): Change =>
    ({ id: ++id, kind: "style", layer: "1", scope: "usage", property: "fill", style: { "background-color": "red" }, target: card, before: null, after: null, ...more }) as Change;

  test("a change in the phone view: the window's width and the tablet's, not the phone's", () => {
    const fill = style({ breakpoint: PHONE });
    expect(outsideOf(fill, [fill], 1280, [768, 390])).toEqual([1280, 768]);
    // The window in the phone's range: the views outside it alone.
    expect(outsideOf(fill, [fill], 500, [768, 390])).toEqual([768]);
  });

  test("none for a change at every width, a placement, a layer made this round or with no source marker, or a change to the structure", () => {
    for (const change of [
      style({}),
      style({ breakpoint: PHONE, property: "x" }),
      style({ breakpoint: PHONE, property: "absolute" }),
      style({ breakpoint: PHONE, target: { ...card, made: "9" } as Change["target"] }),
      style({ breakpoint: PHONE, target: { ...card, loc: undefined } as unknown as Change["target"] }),
      style({ breakpoint: PHONE, kind: "delete" }),
    ])
      expect(outsideOf(change, [change], 1280, [768, 390])).toEqual([]);
  });

  test("not where the round changes the property of the layer otherwise: in the desktop view, at a breakpoint of its own, or of the component itself", () => {
    const fill = style({ breakpoint: PHONE });
    expect(outsideOf(fill, [fill, style({})], 1280, [768, 390])).toEqual([]);
    expect(outsideOf(fill, [fill, style({ breakpoint: TABLET })], 1280, [768, 390])).toEqual([1280]);
    expect(outsideOf(fill, [fill, style({ scope: "component", target: fourth })], 1280, [768, 390])).toEqual([]);
    // A CSS property its reference style names, set by another property: the same.
    expect(outsideOf(fill, [fill, style({ property: "background" as Change["property"] })], 1280, [768, 390])).toEqual([]);
  });

  test("still where the round changes another property of the layer, or the property of another usage alone", () => {
    const fill = style({ breakpoint: PHONE });
    expect(outsideOf(fill, [fill, style({ property: "radius", style: { "border-radius": "4px" } })], 1280, [768, 390])).toEqual([1280, 768]);
    expect(outsideOf(fill, [fill, style({ target: fourth })], 1280, [768, 390])).toEqual([1280, 768]);
  });
});
