/** @jsxImportSource preact */
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { propertyTitle } from "../design-values";
import type { Editor, Property } from "./edits";
import type { Layer } from "./layers";

/** What the rows of the Design panel mark: the properties of the selected layers changed on their own at the breakpoint worked in. */
export interface BreakpointMarks {
  /** Of `properties`, those some selected layer has changed on its own at a breakpoint that holds in the view worked in. */
  changed(properties: Property[]): Property[];
  /** Sets `properties` of each selected layer back to inherit there, as one edit. */
  reset(properties: Property[]): void;
}

const Marks = createContext<BreakpointMarks | null>(null);
export const BreakpointMarksProvider = Marks.Provider;

/**
 * The marks of the selected layers, as `editor` tells them in the view worked
 * in: none in the desktop view, which edits every width (ADR 0008).
 */
export function breakpointMarks(editor: Editor, layers: Layer[], onEdit: () => void): BreakpointMarks {
  const here = layers.map((layer) => editor.changesHere(layer));
  return {
    changed: (properties) => properties.filter((property) => here.some((changes) => changes.includes(property))),
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
  const marks = useContext(Marks);
  const changed = marks?.changed(properties) ?? [];
  if (!changed.length) return null;
  const names = listed(changed.map(propertyTitle));
  return (
    <button
      type="button"
      class="vk-row-mark"
      aria-label={`Reset ${names} to inherit`}
      title={`${names}: changed at this breakpoint. Click to reset to inherit from every width`}
      data-vk-property={changed.join(" ")}
      onClick={() => marks!.reset(changed)}
    />
  );
}

/** "Fill", "Columns and Row gap", "X, Y and Absolute". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
