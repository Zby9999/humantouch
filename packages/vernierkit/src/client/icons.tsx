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
  component: "M8 2.5l2 2-2 2-2-2zM8 9.5l2 2-2 2-2-2zM4.5 6l2 2-2 2-2-2zM11.5 6l2 2-2 2-2-2z",
  lock: "M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2",
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg class="vk-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" />
    </svg>
  );
}

export function LayerIcon({ layer }: { layer: Layer }) {
  if (role(layer) === "locked") return <Icon name="lock" />;
  if (role(layer) === "component") return <Icon name="component" />;
  if (layer.kind === "stack") return <Icon name={layer.direction === "horizontal" ? "stack-horizontal" : "stack-vertical"} />;
  return <Icon name={layer.kind} />;
}
