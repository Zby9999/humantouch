import { useEffect } from "react";
import { mountEditorLayer } from "./client/mount";

/** Mounts the editor layer. Put it once in the root component. */
export function Vernier(): null {
  useEffect(() => mountEditorLayer(), []);
  return null;
}
