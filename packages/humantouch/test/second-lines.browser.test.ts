import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, test } from "vitest";
import { useSecondLines } from "../src/client/VariantsPanel";

/**
 * Which ramps' second lines are open (ticket 143): folded at first; one whose
 * Variable comes in use opens by itself, and, folded by hand, stays folded
 * till the Variable in use changes.
 */

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function mount(inUse: string[]) {
  const host = document.createElement("div");
  document.body.append(host);
  let state: ReturnType<typeof useSecondLines> = [new Set(), () => {}];
  function Probe({ inUse }: { inUse: string[] }) {
    state = useSecondLines(inUse);
    return null;
  }
  const draw = (inUse: string[]) => act(() => render(h(Probe, { inUse }), host));
  cleanups.push(() => {
    render(null, host);
    host.remove();
  });
  draw(inUse);
  return {
    draw,
    open: () => [...state[0]].sort(),
    toggle: (name: string) => act(() => state[1](name)),
  };
}

test("folded at first; toggled open and folded by hand", () => {
  const lines = mount([]);
  expect(lines.open()).toEqual([]);
  lines.toggle("neutral");
  expect(lines.open()).toEqual(["neutral"]);
  lines.toggle("neutral");
  expect(lines.open()).toEqual([]);
});

test("a ramp whose Variable is in use as it is shown is open", () => {
  expect(mount(["neutral"]).open()).toEqual(["neutral"]);
});

test("a ramp opens as its Variable comes in use; folded by hand, it stays folded till the Variable in use changes", () => {
  const lines = mount([]);
  lines.draw(["neutral"]);
  expect(lines.open()).toEqual(["neutral"]);

  lines.toggle("neutral");
  expect(lines.open()).toEqual([]);
  // Drawn again with the same Variable in use, as any other change redraws the palette: still folded.
  lines.draw(["neutral"]);
  lines.draw(["neutral"]);
  expect(lines.open()).toEqual([]);

  // Another Variable in use, of another ramp: that one opens, the folded one stays folded.
  lines.draw(["neutral", "slate"]);
  expect(lines.open()).toEqual(["slate"]);
  // None in use, then neutral's again: it opens.
  lines.draw([]);
  lines.draw(["neutral"]);
  expect(lines.open()).toEqual(["neutral", "slate"]);
});
