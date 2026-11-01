/** @jsxImportSource preact */
import { propertyTitle } from "../design-values";
import { breakpointName, tailwindOf } from "./breakpoints";
import { breakpointMarks } from "./BreakpointMark";
import type { Editor } from "./edit-commands";
import type { Property } from "./property-table";
import { Icon } from "./icons";
import type { Layer } from "./layers";

interface Props {
  editor: Editor;
  /** The selected layers. */
  layers: Layer[];
  /** What the view worked in is called: "Phone". */
  view: string;
  /** Called after a property is set back to inherit, so the panel shows the values it inherits. */
  onEdit(): void;
}

/**
 * At the top of the Design panel, in a view other than the desktop view: the
 * breakpoint edits there apply at (ADR 0008), and the properties of the
 * selected layers changed there on their own, each of which can be set back
 * to inherit what the layer shows at every width. The rows of those
 * properties are marked and reset too (`BreakpointMark`), from the same
 * changes; the list also holds those whose row the panel does not show, as
 * for several layers that do not all offer the property.
 */
export function BreakpointSection({ editor, layers, view, onEdit }: Props) {
  const breakpoint = editor.breakpoint();
  const changed: Property[] = [];
  for (const layer of layers) for (const property of editor.changesHere(layer)) if (!changed.includes(property)) changed.push(property);
  // A view in the desktop view's range edits every width, as it does; only what a narrower range recorded before holds there is shown.
  if (!breakpoint && !changed.length) return null;
  const tailwind = tailwindOf(breakpoint);
  // Reset as its row resets it.
  const inherit = (property: Property) => breakpointMarks(editor, layers, onEdit).reset([property]);
  return (
    <section class="tk-section tk-breakpoint" aria-labelledby="tk-breakpoint">
      <div class="tk-section-header">
        <h3 id="tk-breakpoint" class="tk-section-title">
          {view} breakpoint
        </h3>
        <span class="tk-breakpoint-range">{breakpointName(breakpoint)}</span>
      </div>
      <p class="tk-layer-note">
        {breakpoint ? (
          <>
            Style and layout changed here apply {breakpointName(breakpoint)} only
            {tailwind && (
              <>
                {" "}
                (<code class="tk-breakpoint-code">{tailwind}</code>)
              </>
            )}
            .
          </>
        ) : (
          "This view is in the desktop view's range: style and layout changed here apply at every width, but where these were changed on their own."
        )}
      </p>
      {changed.length > 0 && (
        <ul class="tk-breakpoint-changes" aria-label={`Changed at the ${view.toLowerCase()} breakpoint`}>
          {changed.map((property) => (
            <li key={property} class="tk-breakpoint-change" data-tk-property={property}>
              <span class="tk-breakpoint-mark" aria-hidden="true" />
              <span class="tk-breakpoint-name">{propertyTitle(property)}</span>
              <button
                type="button"
                class="tk-icon-button"
                aria-label={`Reset ${propertyTitle(property)} to inherit`}
                title="Reset to inherit from every width"
                onClick={() => inherit(property)}
              >
                <Icon name="undo" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
