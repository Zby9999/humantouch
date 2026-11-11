/** @jsxImportSource preact */
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { togetherWith } from "./BreakpointMark";
import { sameBreakpoint } from "./breakpoints";
import { LAYER_ID_ATTR } from "./canvas-style";
import type { Change } from "./changeset";
import type { Editor } from "./edit-commands";
import { Icon } from "./icons";
import type { Layer } from "./layers";
import type { Property } from "./property-table";

/**
 * What the Design panel's fields mark (designer, 2026-11-07): the
 * properties of the selected layers changed in this round, in the view worked
 * in, each shown in the accent, reversed, with a reset at its end.
 */
export interface ChangeMarks {
  /** Whether some selected layer has `property` changed here; `part`, of a value of several (a side of the padding, a stroke's line): that part of it. */
  changed(property: Property, part?: number | ValuePart): boolean;
  /**
   * Takes the changes to `properties` of the selected layers made here back
   * out of the round, as one edit that can be undone; with `part`, that part
   * of the one property alone, the rest kept as it is.
   */
  reset(properties: Property[], part?: ValuePart): void;
  /**
   * The selected layers' value of `property` before this round's first change
   * to it, as the alignment grid shows where it was (designer, 2026-11-08);
   * null when one of them has none, when they differ, or at a breakpoint.
   */
  before(property: Property): unknown;
  /**
   * Whether what the selected layers have of `property` was added in this round: they had none of it before (a fill, a
   * stroke, a blur, a minimum); with `item`, whether the item of a list (a shadow) is one `item` finds no entry of before.
   * Something added has its fields left unmarked, with no resets: its − alone takes the accent, and takes it back off
   * (designer, 2026-11-08).
   */
  added(property: Property, item?: (before: unknown, after: unknown) => boolean): boolean;
  /**
   * Whether the selected layers were made Stacks or Grids in this round, by ⇧A (a `stack` change, whichever it made, ticket 110):
   * added, as `added` says of a property.
   */
  stacked(): boolean;
  /**
   * Takes the Stacks or Grids the selected layers were made in this round back out, with what was changed of their layout since
   * (`MADE_LAYOUT`), as one edit that can be undone.
   */
  unstack(): void;
}

/** A part of a value its own field shows (a stroke's color, weight, line or sides): marked and reset on its own (designer, 2026-11-07). */
export interface ValuePart {
  /** The part, of a value (null when there is none). */
  of(value: unknown): unknown;
  /**
   * The part as it was in `before`, for the part as it is in `after`: of a list's item, its own entry before, found by
   * identity, not by position (designer, 2026-11-08). None: `of(before)`.
   */
  was?(before: unknown, after: unknown): unknown;
  /** `value` with the part as it is in `before`. */
  back(value: unknown, before: unknown): unknown;
}

const ChangeMarksContext = createContext<ChangeMarks | null>(null);

/** Gives the fields inside it the selected layers' changes. Outside one, no field is marked. */
export const ChangeMarksProvider = ChangeMarksContext.Provider;

/** The marks of the selected layers inside a `ChangeMarksProvider`; none outside. */
export function useChangeMarks(): ChangeMarks {
  return useContext(ChangeMarksContext) ?? NO_MARKS;
}

/** No marks: what is inside an item added in this round, its fields unmarked, with no resets (designer, 2026-11-08). */
export const NO_MARKS: ChangeMarks = { changed: () => false, reset: () => {}, before: () => null, added: () => false, stacked: () => false, unstack: () => {} };

/** The part `part` is of `before`, matched to it as it is in `after`. */
const wasOf = (part: ValuePart, before: unknown, after: unknown) => (part.was ? part.was(before, after) : part.of(before));

/** What a Stack sets of its layout, as the Stack section resets it. Taken back with one made in this round, a Grid's too: `MADE_LAYOUT`. */
export const STACK_PROPERTIES: Property[] = ["direction", "gap", "align", "wrap", "padding", "arrangement"];
/** What is taken back with a Stack or Grid made in this round: a Stack's properties, and a Grid's (ticket 110's follow-up), a Frame made one too. */
const MADE_LAYOUT: Property[] = [...STACK_PROPERTIES, "columns", "rowGap", "columnGap"];

/**
 * The marks of `layers`, from the round's changes: those to a property of
 * one of them, at the breakpoint of the view worked in (none in the desktop
 * view), as the change list lists them. Reset takes them back out, as the
 * change list's own undo of one does. `heldFrom`: while a press is held, the
 * changes as it began.
 */
export function changeMarks(changes: Change[], editor: Editor, layers: Layer[], onEdit: () => void, heldFrom: Change[] | null = null): ChangeMarks {
  // In an instance that edits alone, those made there alone (ticket 114).
  const ids = new Set(layers.map((layer) => editor.recordedAs(layer)));
  const here = editor.breakpoint();
  const of = (property: Property, list = changes) =>
    list.filter((change) => change.kind === "style" && change.property === property && ids.has(change.layer) && sameBreakpoint(change.breakpoint ?? null, here));
  /** Each layer's changes to `property` here: the value before the first of them, and after the last. */
  const runs = (property: Property, list = changes) => {
    const byLayer = new Map<string, Change[]>();
    for (const change of of(property, list)) byLayer.set(change.layer, [...(byLayer.get(change.layer) ?? []), change]);
    return [...byLayer].map(([layer, list]) => ({ layer, list, before: list[0].before, after: list.at(-1)!.after }));
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  /** Whether `property` (that part of it) is changed, by the changes in `list`. */
  const changedIn = (list: Change[], property: Property, part?: number | ValuePart) => {
    // At a breakpoint, what changed there on its own: a change reaching past the view's range too.
    if (here && part === undefined) {
      const now = layers.some((layer) => editor.changedHere(layer, property));
      // As of an earlier list, the editor cannot say: a change to it there then, at any breakpoint, counts.
      return list === changes ? now : now && list.some((change) => change.kind === "style" && change.property === property && ids.has(change.layer));
    }
    const found = of(property, list);
    if (part === undefined) return found.length > 0;
    if (typeof part !== "number") return runs(property, list).some(({ before, after }) => !same(wasOf(part, before, after), part.of(after)));
    // A part changed: as it is now unlike what it was before the round's first change to it.
    return found.some((change) => {
      const before = change.before as unknown[] | null;
      const after = (list.filter((c) => c.layer === change.layer && c.property === property && sameBreakpoint(c.breakpoint ?? null, here)).at(-1) ?? change).after as unknown[] | null;
      return Array.isArray(before) && Array.isArray(after) ? before[part] !== after[part] : true;
    });
  };
  return {
    changed(property, part) {
      // While a press is held (`heldFrom`, the changes as it began), the marks stay as they were then: what it drags is not marked yet,
      // and takes the accent once let go; one changed before stays marked (designer, 2026-11-08), even as the drag passes back over
      // where it started, which takes its change out of the round for that while: it would else fade to gray mid-drag, its reset gone,
      // and come back a moment later (designer, 2026-11-08: gray while held, blue once let go).
      return heldFrom ? changedIn(heldFrom, property, part) : changedIn(changes, property, part);
    },
    reset(properties, part) {
      if (part) {
        // The part put back as it was; where nothing else changed, the changes come out altogether, as a whole reset takes them.
        const [property] = properties;
        const going = runs(property).filter(({ before, after }) => !same(wasOf(part, before, after), part.of(after)));
        if (!going.length) return;
        editor.batch(() => {
          for (const { layer, list, before, after } of going) {
            const back = part.back(after, before);
            if (same(back, before)) for (const change of list) editor.revert(change.id);
            else editor.set(layers.find((l) => editor.recordedAs(l) === layer)!, property, back as never);
          }
        });
        onEdit();
        return;
      }
      if (here) {
        // At a breakpoint, back to inherit, with what changes together with them there; a change reaching past the view's range, in its range only.
        const all = [...new Set([...properties, ...properties.flatMap(togetherWith)])];
        editor.batch(() => {
          for (const layer of layers) for (const property of all) if (editor.changedHere(layer, property)) editor.inherit(layer, property);
        });
        onEdit();
        return;
      }
      const going = properties.flatMap((property) => of(property));
      if (!going.length) return;
      editor.batch(() => {
        for (const change of going) editor.revert(change.id);
      });
      onEdit();
    },
    before(property) {
      // At a breakpoint, `changed` asks the editor what changed there on its own; what was there before is left unshown.
      if (here) return null;
      const found = runs(property);
      if (found.length !== layers.length || found.some(({ before }) => !same(before, found[0].before))) return null;
      return found[0].before;
    },
    added(property, item) {
      // Added on every selected layer: one that had it before has it still, changed or not.
      const found = runs(property);
      const none = (value: unknown) => value === null || value === undefined;
      return found.length === layers.length && found.every(({ before, after }) => (item ? item(before, after) : none(before) && !none(after)));
    },
    stacked() {
      return layers.length > 0 && layers.every((layer) => !!madeStack(layer.el.getAttribute(LAYER_ID_ATTR)));
    },
    unstack() {
      const made = layers.map((layer) => madeStack(layer.el.getAttribute(LAYER_ID_ATTR))).filter((change) => change !== null);
      if (!made.length) return;
      editor.batch(() => {
        for (const stack of made) {
          // What was changed of it as a Stack since it was made, first; then the Stack itself, as if it never was.
          const since = changes.filter((change) => change.kind === "style" && change.layer === stack.layer && change.id > stack.id && MADE_LAYOUT.includes(change.property as Property));
          for (const change of since) editor.revert(change.id);
          editor.revert(stack.id);
        }
      });
      onEdit();
    },
  };
  /** The change that made the layer `id` a Stack or a Grid in this round (⇧A), not dissolved since; null when there is none. */
  function madeStack(id: string | null): Change | null {
    const made = [...changes].reverse().find((change) => change.kind === "stack" && change.layer === id);
    return made && !changes.some((change) => change.kind === "unstack" && change.layer === id && change.id > made.id) ? made : null;
  }
}

/** When a reset was last clicked (not pressed from the keyboard). */
let resetClickedAt = -Infinity;
/** How long after a reset is clicked a number it changes still counts as changed by it: the panel shows it a render or two later (agent's, to confirm). */
const RESET_ROLL_WINDOW_MS = 150;
/** A key pressed meanwhile (⌘Z, say) changes numbers itself: from then on they change at once, unrolled. */
if (typeof window !== "undefined") window.addEventListener("keydown", () => void (resetClickedAt = -Infinity), true);

/** Whether a reset was clicked just now: a number changing now was taken back by it, and rolls to its value (designer, 2026-11-08). */
export function resetJustClicked(): boolean {
  return performance.now() - resetClickedAt < RESET_ROLL_WINDOW_MS;
}

/** A changed field's reset, at its right end: takes the change back out. */
export function ResetButton({ label, onReset }: { label: string; onReset(): void }) {
  return (
    <button
      type="button"
      class="ht-reset"
      aria-label={`Reset ${label}`}
      data-ht-tip={`Reset ${label}`}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        // Clicked, not pressed from the keyboard: the numbers it takes back roll to their values (designer, 2026-11-08).
        if (event.detail > 0) resetClickedAt = performance.now();
        onReset();
      }}
    >
      <Icon name="reset" />
    </button>
  );
}
