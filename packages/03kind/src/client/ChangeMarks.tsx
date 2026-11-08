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
}

/** A part of a value its own field shows (a stroke's color, weight, line or sides): marked and reset on its own (designer, 2026-11-07). */
export interface ValuePart {
  /** The part, of a value (null when there is none). */
  of(value: unknown): unknown;
  /** `value` with the part as it is in `before`. */
  back(value: unknown, before: unknown): unknown;
}

const ChangeMarksContext = createContext<ChangeMarks | null>(null);

/** Gives the fields inside it the selected layers' changes. Outside one, no field is marked. */
export const ChangeMarksProvider = ChangeMarksContext.Provider;

/** The marks of the selected layers inside a `ChangeMarksProvider`; none outside. */
export function useChangeMarks(): ChangeMarks {
  return useContext(ChangeMarksContext) ?? NONE;
}

const NONE: ChangeMarks = { changed: () => false, reset: () => {} };

/**
 * The marks of `layers`, from the round's changes: those to a property of
 * one of them, at the breakpoint of the view worked in (none in the desktop
 * view), as the change list lists them. Reset takes them back out, as the
 * change list's own undo of one does.
 */
export function changeMarks(changes: Change[], editor: Editor, layers: Layer[], onEdit: () => void): ChangeMarks {
  const ids = new Set(layers.map((layer) => layer.el.getAttribute(LAYER_ID_ATTR)));
  const here = editor.breakpoint();
  const of = (property: Property) =>
    changes.filter((change) => change.kind === "style" && change.property === property && ids.has(change.layer) && sameBreakpoint(change.breakpoint ?? null, here));
  /** Each layer's changes to `property` here: the value before the first of them, and after the last. */
  const runs = (property: Property) => {
    const byLayer = new Map<string, Change[]>();
    for (const change of of(property)) byLayer.set(change.layer, [...(byLayer.get(change.layer) ?? []), change]);
    return [...byLayer].map(([layer, list]) => ({ layer, list, before: list[0].before, after: list.at(-1)!.after }));
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return {
    changed(property, part) {
      // At a breakpoint, what changed there on its own: a change reaching past the view's range too.
      if (here && part === undefined) return layers.some((layer) => editor.changedHere(layer, property));
      const found = of(property);
      if (part === undefined) return found.length > 0;
      if (typeof part !== "number") return runs(property).some(({ before, after }) => !same(part.of(before), part.of(after)));
      // A part changed: as it is now unlike what it was before the round's first change to it.
      return found.some((change) => {
        const before = change.before as unknown[] | null;
        const after = (changes.filter((c) => c.layer === change.layer && c.property === property && sameBreakpoint(c.breakpoint ?? null, here)).at(-1) ?? change).after as unknown[] | null;
        return Array.isArray(before) && Array.isArray(after) ? before[part] !== after[part] : true;
      });
    },
    reset(properties, part) {
      if (part) {
        // The part put back as it was; where nothing else changed, the changes come out altogether, as a whole reset takes them.
        const [property] = properties;
        const going = runs(property).filter(({ before, after }) => !same(part.of(before), part.of(after)));
        if (!going.length) return;
        editor.batch(() => {
          for (const { layer, list, before, after } of going) {
            const back = part.back(after, before);
            if (same(back, before)) for (const change of list) editor.revert(change.id);
            else editor.set(layers.find((l) => l.el.getAttribute(LAYER_ID_ATTR) === layer)!, property, back as never);
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
      const going = properties.flatMap(of);
      if (!going.length) return;
      editor.batch(() => {
        for (const change of going) editor.revert(change.id);
      });
      onEdit();
    },
  };
}

/** A changed field's reset, at its right end: takes the change back out. */
export function ResetButton({ label, onReset }: { label: string; onReset(): void }) {
  return (
    <button
      type="button"
      class="tk-reset"
      aria-label={`Reset ${label}`}
      title={`Reset ${label}: take its change in this round back out`}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onReset();
      }}
    >
      <Icon name="reset" />
    </button>
  );
}
