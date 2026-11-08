/** @jsxImportSource preact */
import { breakpointName, tailwindOf } from "./breakpoints";
import type { Editor } from "./edit-commands";
import type { Property } from "./property-table";
import type { Layer } from "./layers";

interface Props {
  editor: Editor;
  /** The selected layers. */
  layers: Layer[];
  /** What the view worked in is called: "Phone". */
  view: string;
}

/**
 * At the top of the Design panel, in a view other than the desktop view: the
 * breakpoint edits there apply at (ADR 0008). What the selected layers have
 * changed there shows on its fields, each with its reset, not in a list here
 * too (designer, 2026-11-07).
 */
export function BreakpointSection({ editor, layers, view }: Props) {
  const breakpoint = editor.breakpoint();
  const changed: Property[] = [];
  for (const layer of layers) for (const property of editor.changesHere(layer)) if (!changed.includes(property)) changed.push(property);
  // A view in the desktop view's range edits every width, as it does; only what a narrower range recorded before holds there is shown.
  if (!breakpoint && !changed.length) return null;
  const tailwind = tailwindOf(breakpoint);
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
    </section>
  );
}
