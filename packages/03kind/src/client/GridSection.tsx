/** @jsxImportSource preact */
import type { Editor } from "./edit-commands";
import type { Layer } from "./layers";
import { NumberField, stepOptions, type SlotOf } from "./Properties";
import { VariableSlot } from "./VariablePicker";

interface Props {
  editor: Editor;
  /** The selected layers: the section shows when each is a Grid. */
  layers: Layer[];
  /** Called after each edit, so the panel shows the new values. */
  onEdit(): void;
  /** A gap as a field that can be a spacing Variable; undefined when the project has none. */
  variable: SlotOf;
}

/** What the section edits. */
type GridProperty = "columns" | "rowGap" | "columnGap";

/**
 * A Grid the page has: how many columns it lays its layers out in, and the
 * space between its rows and between its columns, as the view worked in shows
 * them; each gap can be a spacing Variable. Columns are set as that many equal
 * columns. With several Grids selected, a value they do not share shows as
 * Mixed, and a change goes to each.
 */
export function GridSection({ editor, layers, onEdit, variable }: Props) {
  if (!layers.every((layer) => editor.can(layer, "columns"))) return null;
  /** The value the Grids share; null when they do not: Mixed. */
  const shown = (property: GridProperty) => {
    const [first, ...rest] = layers.map((layer) => editor.read(layer, property));
    return rest.every((value) => value === first) ? first : null;
  };
  const set = (property: GridProperty) => (value: number, continues = false) => {
    // A whole number of columns, at least one, as a drag on the field goes through any number.
    const next = property === "columns" ? Math.max(1, Math.round(value)) : Math.max(0, value);
    editor.batch(() => {
      for (const layer of layers) editor.set(layer, property, next);
    }, stepOptions(continues));
    onEdit();
  };
  return (
    <section class="tk-section" aria-labelledby="tk-grid">
      <h3 id="tk-grid" class="tk-section-title">
        Grid
      </h3>
      <div class="tk-grid-2">
        <NumberField label="Columns" icon="grid" property="columns" value={shown("columns")} min={1} onChange={set("columns")} />
      </div>
      <div class="tk-grid-2">
        <VariableSlot label="Row gap" slot={variable("rowGap")} property="rowGap">
          <NumberField label="Row gap" icon="row-gap" property="rowGap" value={shown("rowGap")} min={0} onChange={set("rowGap")} />
        </VariableSlot>
        <VariableSlot label="Column gap" slot={variable("columnGap")} property="columnGap">
          <NumberField label="Column gap" icon="gap" property="columnGap" value={shown("columnGap")} min={0} onChange={set("columnGap")} />
        </VariableSlot>
      </div>
    </section>
  );
}
