/** @jsxImportSource preact */
import { role, type Layer } from "./layers";

/** 16px glyphs, drawn in the current text color. */
const PATHS: Record<string, string> = {
  "stack-vertical": "M4 3.5h8v3.5H4zM4 9h8v3.5H4z",
  "stack-horizontal": "M3.5 4h3.5v8H3.5zM9 4h3.5v8H9z",
  grid: "M3.5 3.5h3.5v3.5H3.5zM9 3.5h3.5v3.5H9zM3.5 9h3.5v3.5H3.5zM9 9h3.5v3.5H9z",
  frame: "M5.5 2.5v11M10.5 2.5v11M2.5 5.5h11M2.5 10.5h11",
  text: "M3.5 4h9M8 4v8.5",
  image: "M3 3.5h10v9H3zM3 10.5l3-3 2.5 2.5 1.5-1.5 3 3",
  still: "M3 3.5h10v9H3zM6.5 6v4l3.5-2z",
  instance: "M8 2.5l2 2-2 2-2-2zM8 9.5l2 2-2 2-2-2zM4.5 6l2 2-2 2-2-2zM11.5 6l2 2-2 2-2-2z",
  lock: "M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2",
  radius: "M3.5 12.5V8a4.5 4.5 0 0 1 4.5-4.5h4.5",
  plus: "M8 3.5v9M3.5 8h9",
  minus: "M3.5 8h9",
  gap: "M3.5 3v10M12.5 3v10M6.5 8h3",
  close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  opacity: "M3.5 3.5h9v9h-9zM3.5 9.5l6-6M6.5 12.5l6-6",
  undo: "M5.5 4 3 6.5 5.5 9M3 6.5h6.5a3.25 3.25 0 0 1 0 6.5H7",
  sidebar: "M2.5 3.5h11v9h-11zM6 3.5v9",
  play: "M5 3.5v9l7-4.5z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg class="vk-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" />
    </svg>
  );
}

export function LayerIcon({ layer }: { layer: Layer }) {
  if (role(layer) === "locked") return <Icon name="lock" />;
  if (role(layer) === "instance") return <Icon name="instance" />;
  if (layer.kind === "stack") return <Icon name={layer.direction === "horizontal" ? "stack-horizontal" : "stack-vertical"} />;
  return <Icon name={layer.kind} />;
}
