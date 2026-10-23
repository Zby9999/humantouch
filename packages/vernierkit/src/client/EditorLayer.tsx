/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { ENTER_MARK } from "./CanvasView";
import { Shell } from "./Shell";
import { Toggle } from "./Toggle";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

/** Preview mode shows only the toggle; edit mode adds the shell around a fresh canvas. */
export function EditorLayer() {
  const [mode, setMode] = useState<Mode>("preview");
  const [animate, setAnimate] = useState(true);

  return (
    <>
      {mode !== "preview" && <Shell leaving={mode === "leaving"} animate={animate} onLeft={() => setMode("preview")} />}
      <Toggle
        editing={mode === "edit"}
        onToggle={(animate) => {
          setAnimate(animate);
          if (mode === "preview") performance.mark(ENTER_MARK);
          // A click while leaving turns back to the same canvas.
          setMode(mode === "edit" ? (animate ? "leaving" : "preview") : "edit");
        }}
      />
    </>
  );
}
