/** @jsxImportSource preact */
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { propertyTitle } from "../design-values";
import type { Editor } from "./edit-commands";
import type { Property } from "./property-table";
import type { Layer } from "./layers";

/** What the rows of the Design panel mark: the properties of the selected layers changed on their own at the breakpoint worked in. */
export interface BreakpointMarks {
  /** Of `properties`, those some selected layer has changed on its own at a breakpoint that holds in the view worked in. */
  changed(properties: Property[]): Property[];
  /** Sets `properties` of each selected layer back to inherit there, as one edit. */
  reset(properties: Property[]): void;
}

const BreakpointMarksContext = createContext<BreakpointMarks | null>(null);

/** Gives the rows inside it the marks of the selected layers. Outside one, no row is marked. */
export const BreakpointMarksProvider = BreakpointMarksContext.Provider;

/**
 * The marks of the selected layers, as `editor` tells them in the view worked
 * in: none in the desktop view, which edits every width (ADR 0008).
 */
export function breakpointMarks(editor: Editor, layers: Layer[], onEdit: () => void): BreakpointMarks {
  /** Each selected layer's properties changed on their own here. */
  const changedOf = layers.map((layer) => editor.changesHere(layer));
  return {
    changed: (properties) => properties.filter((property) => changedOf.some((changes) => changes.includes(property))),
    reset(properties) {
      editor.batch(() => {
        for (const layer of layers) for (const property of properties) if (editor.changedHere(layer, property)) editor.inherit(layer, property);
      });
      onEdit();
    },
  };
}

/**
 * On a row of the Design panel, in its left margin: a mark when the row's
 * properties are changed on their own at the breakpoint worked in, as in
 * Framer. Clicked, they inherit again, as the breakpoint's list resets them
 * (`BreakpointSection`). The row is `vk-markable`, for the mark to sit beside it.
 */
export function BreakpointMark({ properties }: { properties: Property[] }) {
  const marks = useContext(BreakpointMarksContext);
  const changed = marks?.changed(properties) ?? [];
  if (!changed.length) return null;
  const names = listed(changed.map(propertyTitle));
  return (
    <button
      type="button"
      class="vk-row-mark"
      aria-label={`Reset ${names} to inherit`}
      title={`${names}: changed at this breakpoint. Click to reset to inherit from every width`}
      onClick={() => marks!.reset(changed)}
    />
  );
}

/** Names as a phrase: "Fill", "Columns and Row gap", "X, Y and Absolute". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
