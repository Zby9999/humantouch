import { describe, expect, test } from "vitest";
import { layoutViews, shownAt, viewsWidth } from "../src/client/view-layout";
import type { View } from "../src/client/views";

/** A view as the layout reads it: how tall it is. */
const view = (height: number) => ({ height }) as View;

describe("the views side by side on the stage", () => {
  test("the desktop view first, then the others in order, a gap between each; one not laid out yet has no height", () => {
    const tablet = view(1400);
    const placed = layoutViews(1440, view(900), [768, 390], new Map([[768, tablet]]));
    expect(placed.map(({ name, desktop, x, y, width, height }) => ({ name, desktop, x, y, width, height }))).toEqual([
      { name: "Desktop", desktop: true, x: 0, y: 0, width: 1440, height: 900 },
      { name: "Tablet", desktop: false, x: 1520, y: 0, width: 768, height: 1400 },
      { name: "Phone", desktop: false, x: 2368, y: 0, width: 390, height: 0 },
    ]);
    expect(placed[2].view).toBeNull();
    expect(viewsWidth(1440, [768, 390])).toBe(2758);
  });

  test("a point on the stage is in the view it falls in, in that view's px; in the gap between, or in a view not laid out, in none", () => {
    const placed = layoutViews(1440, view(900), [768, 390], new Map([[768, view(1400)]]));
    expect(shownAt(placed, 1600, 30)).toMatchObject({ at: placed[1], x: 80, y: 30 });
    expect(shownAt(placed, 1480, 30)).toBeNull();
    expect(shownAt(placed, 2400, 0)).toBeNull();
  });
});
