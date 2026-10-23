/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { ENTER_MARK } from "./CanvasView";
import { connectRoundStore } from "./service";
import { Shell } from "./Shell";
import { Toggle } from "./Toggle";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

/**
 * Preview mode shows only the toggle; edit mode adds the shell around the
 * canvas. A round with changes not yet applied keeps its canvas: edit mode
 * comes back to it, after a reload too. With none, edit mode freezes the page afresh.
 */
export function EditorLayer() {
  const [mode, setMode] = useState<Mode>("preview");
  const [animate, setAnimate] = useState(true);
  const [store] = useState(connectRoundStore);
  /** Undefined until the saved round, if any, has loaded. */
  const [round, setRound] = useState<SavedRound | null | undefined>(store ? undefined : null);
  /** Changes not yet applied, for the toggle's badge. */
  const [changeCount, setChangeCount] = useState(0);

  useEffect(() => {
    store?.load().then((saved) => {
      setRound(saved);
      setChangeCount(saved?.changeSet.changes.length ?? 0);
    }, (error: unknown) => {
      console.warn(error);
      setRound(null);
    });
  }, []);

  const save = (next: SavedRound | null) => {
    setRound(next);
    store?.save(next).catch((error: unknown) => console.warn(error));
  };

  return (
    <>
      {mode !== "preview" && round !== undefined && (
        <Shell saved={round} onSave={save} onChangeCount={setChangeCount} leaving={mode === "leaving"} animate={animate} onLeft={() => setMode("preview")} />
      )}
      <Toggle
        editing={mode === "edit"}
        changeCount={changeCount}
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
