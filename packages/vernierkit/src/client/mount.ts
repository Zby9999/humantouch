import { h, render } from "preact";
import { styles } from "./styles";
import { Toggle } from "./Toggle";

const HOST_TAG = "vernier-kit";

/**
 * Mounts the editor layer in its own Shadow DOM so page styles and editor
 * styles never reach each other. Returns the unmount function.
 */
export function mountEditorLayer(): () => void {
  if (document.querySelector(HOST_TAG)) return () => {};

  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const container = document.createElement("div");
  shadow.append(style, container);
  // Outside <body>, so page transforms on body cannot break fixed positioning.
  document.documentElement.append(host);

  render(h(Toggle, { onToggle: () => {} }), container);

  return () => {
    render(null, container);
    host.remove();
  };
}
