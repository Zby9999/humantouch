import { h, render } from "preact";
import { CHECK_FRAME_ATTR, HOST_TAG } from "./host";
import { LazyEditorLayer } from "./LazyEditorLayer";
import { toggleStyles } from "./toggle-styles";

/**
 * Mounts the editor layer in its own Shadow DOM so page styles and editor
 * styles never reach each other. The toggle first: the rest of the editor
 * layer, styles included, loads once it is needed. Returns the unmount function.
 */
export function mountEditorLayer(): () => void {
  if (document.querySelector(HOST_TAG)) return () => {};
  // The page loaded at another width, only to be checked there.
  if (window.frameElement?.hasAttribute(CHECK_FRAME_ATTR)) return () => {};

  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = toggleStyles;
  const container = document.createElement("div");
  shadow.append(style, container);
  // Outside <body>, so page transforms on body cannot break fixed positioning.
  document.documentElement.append(host);

  // After the toggle's, as they were written.
  const onStyles = (css: string) => {
    const more = document.createElement("style");
    more.textContent = css;
    style.after(more);
  };
  render(h(LazyEditorLayer, { onStyles }), container);

  return () => {
    render(null, container);
    host.remove();
  };
}
