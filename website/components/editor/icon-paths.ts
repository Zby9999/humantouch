

/** The editor's icons, copied from packages/humantouch/src/client/icons.tsx: the markup inside a 16px square, lines in the current color. */
export const ICONS: Record<string, string> = {
  // Rows
  "stack-vertical": '<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.15"/><line x1="2.25" y1="8" x2="13.75" y2="8"/>',
  // Columns
  "stack-horizontal": '<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.15"/><line x1="8" y1="2.75" x2="8" y2="13.25"/>',
  // Grid
  grid: '<rect x="2.25" y="2.25" width="4.25" height="4.25" rx="0.575"/><rect x="9.5" y="2.25" width="4.25" height="4.25" rx="0.575"/><rect x="2.25" y="9.5" width="4.25" height="4.25" rx="0.575"/><rect x="9.5" y="9.5" width="4.25" height="4.25" rx="0.575"/>',
  // Frame
  frame: '<line x1="4.5" y1="1.75" x2="4.5" y2="14.25"/><line x1="11.5" y1="1.75" x2="11.5" y2="14.25"/><line x1="1.75" y1="4.5" x2="14.25" y2="4.5"/><line x1="1.75" y1="11.5" x2="14.25" y2="11.5"/>',
  // Text
  text: '<path d="M2.75 4.25 L2.75 2.9 C2.75 2.817 2.817 2.75 2.9 2.75 L13.1 2.75 C13.183 2.75 13.25 2.817 13.25 2.9 L13.25 4.25"/><line x1="8" y1="2.75" x2="8" y2="13.25"/><line x1="6" y1="13.25" x2="10" y2="13.25"/>',
  // Image
  image: '<rect x="2" y="2.75" width="12" height="10.5" rx="1.15"/><circle cx="5.75" cy="6.25" r="1.25"/><path d="M2.5 12 L6 8.5 L9.25 11.75"/><path d="M8.25 10.75 L10.25 8.75 L13.5 12"/>',
  // Film
  still: '<rect x="2" y="2.75" width="12" height="10.5" rx="1.15"/><line x1="5.25" y1="2.75" x2="5.25" y2="13.25"/><line x1="10.75" y1="2.75" x2="10.75" y2="13.25"/><line x1="2" y1="8" x2="5.25" y2="8"/><line x1="10.75" y1="8" x2="14" y2="8"/>',
  // Component
  instance: '<path d="M8.106 1.856 L9.894 3.644 C9.953 3.703 9.953 3.797 9.894 3.856 L8.106 5.644 C8.047 5.703 7.953 5.703 7.894 5.644 L6.106 3.856 C6.047 3.797 6.047 3.703 6.106 3.644 L7.894 1.856 C7.953 1.797 8.047 1.797 8.106 1.856 Z"/><path d="M12.356 6.106 L14.144 7.894 C14.203 7.953 14.203 8.047 14.144 8.106 L12.356 9.894 C12.297 9.953 12.203 9.953 12.144 9.894 L10.356 8.106 C10.297 8.047 10.297 7.953 10.356 7.894 L12.144 6.106 C12.203 6.047 12.297 6.047 12.356 6.106 Z"/><path d="M8.106 10.356 L9.894 12.144 C9.953 12.203 9.953 12.297 9.894 12.356 L8.106 14.144 C8.047 14.203 7.953 14.203 7.894 14.144 L6.106 12.356 C6.047 12.297 6.047 12.203 6.106 12.144 L7.894 10.356 C7.953 10.297 8.047 10.297 8.106 10.356 Z"/><path d="M3.856 6.106 L5.644 7.894 C5.703 7.953 5.703 8.047 5.644 8.106 L3.856 9.894 C3.797 9.953 3.703 9.953 3.644 9.894 L1.856 8.106 C1.797 8.047 1.797 7.953 1.856 7.894 L3.644 6.106 C3.703 6.047 3.797 6.047 3.856 6.106 Z"/>',
  // Lock
  lock: '<path d="M5.25 7 V5 A2.75 2.75 0 0 1 10.75 5 V7"/><rect x="3" y="7" width="10" height="7" rx="1.15"/><line x1="8" y1="9.75" x2="8" y2="11.25"/>',
  // Corner radius
  radius: '<path d="M2.75 13.5 V9.25 A6.5 6.5 0 0 1 9.25 2.75 H13.5"/><circle cx="2.75" cy="2.75" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.75" cy="5.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="5.5" cy="2.75" r="1.15" fill="currentColor" stroke="none"/>',
  // Hexagon: a Variable, as in Figma
  variable: '<path d="M8.15 1.837 L13.263 4.788 C13.356 4.842 13.413 4.941 13.413 5.048 L13.413 10.952 C13.413 11.059 13.356 11.158 13.263 11.212 L8.15 14.163 C8.057 14.217 7.943 14.217 7.85 14.163 L2.737 11.212 C2.644 11.158 2.587 11.059 2.587 10.952 L2.587 5.048 C2.587 4.941 2.644 4.842 2.737 4.788 L7.85 1.837 C7.943 1.783 8.057 1.783 8.15 1.837 Z"/>',
  // Unlink: detach from a Variable
  detach: '<path d="M5.348 7.47 L3.757 9.061 A2.25 2.25 0 0 0 6.939 12.243 L8.53 10.652"/><path d="M7.47 5.348 L9.061 3.757 A2.25 2.25 0 0 1 12.243 6.939 L10.652 8.53"/><line x1="4.111" y1="4.111" x2="4.995" y2="4.995"/><line x1="11.005" y1="11.005" x2="11.889" y2="11.889"/>',
  // Maximize
  corners: '<path d="M2.25 6 L2.25 2.5 C2.25 2.362 2.362 2.25 2.5 2.25 L6 2.25"/><path d="M10 2.25 L13.5 2.25 C13.638 2.25 13.75 2.362 13.75 2.5 L13.75 6"/><path d="M13.75 10 L13.75 13.5 C13.75 13.638 13.638 13.75 13.5 13.75 L10 13.75"/><path d="M6 13.75 L2.5 13.75 C2.362 13.75 2.25 13.638 2.25 13.5 L2.25 10"/>',
  // Plus
  plus: '<line x1="8" y1="2.75" x2="8" y2="13.25"/><line x1="2.75" y1="8" x2="13.25" y2="8"/>',
  // Check: the option chosen in a menu
  check: '<path d="M2.75 8.5 L6.25 12 L13.25 4.5"/>',
  // Eyedropper: pick a color from the screen
  eyedropper: '<path d="M6.939 7.293 L3.934 10.298 L3.227 12.773 L5.702 12.066 L8.707 9.061 L6.939 7.293 Z"/><path d="M6.409 6.763 L9.414 3.757 A2 2 0 0 1 12.243 6.586 L9.237 9.591"/><line x1="5.525" y1="5.879" x2="10.121" y2="10.475"/>',
  // Minus
  minus: '<line x1="2.75" y1="8" x2="13.25" y2="8"/>',
  // Spacing gap
  gap: '<rect x="2.25" y="2.25" width="2.5" height="11.5" rx="0.575"/><rect x="11.25" y="2.25" width="2.5" height="11.5" rx="0.575"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="7.25" y1="5" x2="8.75" y2="5"/><line x1="7.25" y1="11" x2="8.75" y2="11"/>',
  // Padding, its mark on the top side alone
  "padding-top": '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.15"/><line x1="6.5" y1="5" x2="9.5" y2="5"/>',
  // Padding, its mark on the right side alone
  "padding-right": '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.15"/><line x1="11" y1="6.5" x2="11" y2="9.5"/>',
  // Padding, its mark on the bottom side alone
  "padding-bottom": '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.15"/><line x1="6.5" y1="11" x2="9.5" y2="11"/>',
  // Padding, its mark on the left side alone
  "padding-left": '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.15"/><line x1="5" y1="6.5" x2="5" y2="9.5"/>',
  // Arrow left right: a width
  width: '<line x1="2.5" y1="8" x2="13.5" y2="8"/><path d="M5.75 4.75 L2.5 8 L5.75 11.25"/><path d="M10.25 4.75 L13.5 8 L10.25 11.25"/>',
  // Arrow up down: a height
  height: '<g transform="rotate(90 8 8)"><line x1="2.5" y1="8" x2="13.5" y2="8"/><path d="M5.75 4.75 L2.5 8 L5.75 11.25"/><path d="M10.25 4.75 L13.5 8 L10.25 11.25"/></g>',
  // Move horizontal, its arrows turned to the line: a minimum width
  "min-width": '<line x1="8" y1="3.5" x2="8" y2="12.5"/><line x1="2.5" y1="8" x2="5.25" y2="8"/><path d="M3 5.75 L5.25 8 L3 10.25"/><line x1="10.75" y1="8" x2="13.5" y2="8"/><path d="M13 5.75 L10.75 8 L13 10.25"/>',
  // The same, turned: a minimum height
  "min-height": '<g transform="rotate(90 8 8)"><line x1="8" y1="3.5" x2="8" y2="12.5"/><line x1="2.5" y1="8" x2="5.25" y2="8"/><path d="M3 5.75 L5.25 8 L3 10.25"/><line x1="10.75" y1="8" x2="13.5" y2="8"/><path d="M13 5.75 L10.75 8 L13 10.25"/></g>',
  // Fit to width: a maximum width
  "max-width": '<line x1="2.25" y1="3.5" x2="2.25" y2="12.5"/><line x1="13.75" y1="3.5" x2="13.75" y2="12.5"/><line x1="4.75" y1="8" x2="11.25" y2="8"/><path d="M7 5.75 L4.75 8 L7 10.25"/><path d="M9 5.75 L11.25 8 L9 10.25"/>',
  // Fit to height: a maximum height
  "max-height": '<g transform="rotate(90 8 8)"><line x1="2.25" y1="3.5" x2="2.25" y2="12.5"/><line x1="13.75" y1="3.5" x2="13.75" y2="12.5"/><line x1="4.75" y1="8" x2="11.25" y2="8"/><path d="M7 5.75 L4.75 8 L7 10.25"/><path d="M9 5.75 L11.25 8 L9 10.25"/></g>',
  // Corner radius: the top left corner's
  "corner-top-left": '<path d="M2.75 13.5 V9.25 A6.5 6.5 0 0 1 9.25 2.75 H13.5"/><circle cx="2.75" cy="2.75" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.75" cy="5.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="5.5" cy="2.75" r="1.15" fill="currentColor" stroke="none"/>',
  // Corner radius, turned: the top right corner's
  "corner-top-right": '<g transform="rotate(90 8 8)"><path d="M2.75 13.5 V9.25 A6.5 6.5 0 0 1 9.25 2.75 H13.5"/><circle cx="2.75" cy="2.75" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.75" cy="5.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="5.5" cy="2.75" r="1.15" fill="currentColor" stroke="none"/></g>',
  // Corner radius, turned: the bottom right corner's
  "corner-bottom-right": '<g transform="rotate(180 8 8)"><path d="M2.75 13.5 V9.25 A6.5 6.5 0 0 1 9.25 2.75 H13.5"/><circle cx="2.75" cy="2.75" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.75" cy="5.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="5.5" cy="2.75" r="1.15" fill="currentColor" stroke="none"/></g>',
  // Corner radius, turned: the bottom left corner's
  "corner-bottom-left": '<g transform="rotate(270 8 8)"><path d="M2.75 13.5 V9.25 A6.5 6.5 0 0 1 9.25 2.75 H13.5"/><circle cx="2.75" cy="2.75" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.75" cy="5.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="5.5" cy="2.75" r="1.15" fill="currentColor" stroke="none"/></g>',
  // Spacing gap, turned: the gap between rows
  "row-gap": '<g transform="rotate(90 8 8)"><rect x="2.25" y="2.25" width="2.5" height="11.5" rx="0.575"/><rect x="11.25" y="2.25" width="2.5" height="11.5" rx="0.575"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="7.25" y1="5" x2="8.75" y2="5"/><line x1="7.25" y1="11" x2="8.75" y2="11"/></g>',
  // Font size
  "font-size": '<line x1="2" y1="3" x2="9.5" y2="3"/><line x1="5.75" y1="3" x2="5.75" y2="13"/><line x1="9.25" y1="7.5" x2="14.25" y2="7.5"/><line x1="11.75" y1="7.5" x2="11.75" y2="13"/>',
  // Line height
  "line-height": '<line x1="4" y1="2.25" x2="4" y2="13.75"/><path d="M2 4.25 L4 2.25 L6 4.25"/><path d="M2 11.75 L4 13.75 L6 11.75"/><line x1="8.75" y1="3.25" x2="14" y2="3.25"/><line x1="8.75" y1="8" x2="14" y2="8"/><line x1="8.75" y1="12.75" x2="14" y2="12.75"/>',
  // Letter spacing
  "letter-spacing": '<path d="M5.5 8.75 L8 1.75 L10.5 8.75"/><line x1="6.25" y1="6.5" x2="9.75" y2="6.5"/><line x1="2.25" y1="12.5" x2="13.75" y2="12.5"/><path d="M3.875 10.875 L2.25 12.5 L3.875 14.125"/><path d="M12.125 10.875 L13.75 12.5 L12.125 14.125"/>',
  // Angle
  angle: '<path d="M10.5 3.75 L2.75 13 L13.25 13"/><path d="M8.25 13 A5.5 5.5 0 0 0 6.28 8.79"/>',
  // Blur
  blur: '<circle cx="8" cy="8" r="1.75"/><circle cx="4" cy="4" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="4" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="4" r="1.15" fill="currentColor" stroke="none"/><circle cx="4" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
  // Stroke width
  "stroke-weight": '<line x1="2.25" y1="2.875" x2="13.75" y2="2.875"/><rect x="2.25" y="5.625" width="11.5" height="1.25" rx="0.575"/><rect x="2.25" y="9.625" width="11.5" height="3.75" rx="0.575"/>',
  // Top border and the like, its dots on the box's edge alone: the stroke on the top side
  "stroke-top": '<line x1="2.5" y1="2.5" x2="13.5" y2="2.5"/><circle cx="2.5" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.5" cy="13.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="13.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="13.5" r="1.15" fill="currentColor" stroke="none"/>',
  // Top border and the like, its dots on the box's edge alone: the stroke on the right side
  "stroke-right": '<line x1="13.5" y1="2.5" x2="13.5" y2="13.5"/><circle cx="2.5" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.5" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.5" cy="13.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="13.5" r="1.15" fill="currentColor" stroke="none"/>',
  // Top border and the like, its dots on the box's edge alone: the stroke on the bottom side
  "stroke-bottom": '<line x1="2.5" y1="13.5" x2="13.5" y2="13.5"/><circle cx="2.5" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="2.5" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="8" r="1.15" fill="currentColor" stroke="none"/>',
  // Top border and the like, its dots on the box's edge alone: the stroke on the left side
  "stroke-left": '<line x1="2.5" y1="2.5" x2="2.5" y2="13.5"/><circle cx="8" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="2.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="13.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="13.5" r="1.15" fill="currentColor" stroke="none"/>',
  // Close
  close: '<line x1="3.75" y1="3.75" x2="12.25" y2="12.25"/><line x1="12.25" y1="3.75" x2="3.75" y2="12.25"/>',
  // Checker pattern
  opacity: '<rect x="1.875" y="1.875" width="12.25" height="12.25" rx="1.15"/><rect x="4.125" y="4.125" width="1" height="1" rx="0"/><circle cx="4.625" cy="4.625" r="1.15" fill="currentColor" stroke="none"/><rect x="8.625" y="4.125" width="1" height="1" rx="0"/><circle cx="9.125" cy="4.625" r="1.15" fill="currentColor" stroke="none"/><rect x="6.375" y="6.375" width="1" height="1" rx="0"/><circle cx="6.875" cy="6.875" r="1.15" fill="currentColor" stroke="none"/><rect x="10.875" y="6.375" width="1" height="1" rx="0"/><circle cx="11.375" cy="6.875" r="1.15" fill="currentColor" stroke="none"/><rect x="4.125" y="8.625" width="1" height="1" rx="0"/><circle cx="4.625" cy="9.125" r="1.15" fill="currentColor" stroke="none"/><rect x="8.625" y="8.625" width="1" height="1" rx="0"/><circle cx="9.125" cy="9.125" r="1.15" fill="currentColor" stroke="none"/><rect x="6.375" y="10.875" width="1" height="1" rx="0"/><circle cx="6.875" cy="11.375" r="1.15" fill="currentColor" stroke="none"/><rect x="10.875" y="10.875" width="1" height="1" rx="0"/><circle cx="11.375" cy="11.375" r="1.15" fill="currentColor" stroke="none"/>',
  // Undo
  undo: '<path d="M2.75 6.5 H9.75 A3.5 3.5 0 0 1 9.75 13.5 H6.25"/><path d="M6 3.25 L2.75 6.5 L6 9.75"/>',
  // Sidebar left
  sidebar: '<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.15"/><line x1="6" y1="2.75" x2="6" y2="13.25"/>',
  // Drawn for a view's full screen button (designer, 2026-11-08), in IconMCP's manner: four corner brackets.
  fullscreen: '<path d="M2.75 6 V2.75 H6"/><path d="M10 2.75 H13.25 V6"/><path d="M13.25 10 V13.25 H10"/><path d="M6 13.25 H2.75 V10"/>',
  // Pointer
  // A cursor's head alone, its tail gone (designer, 2026-11-08): moved 0.4 down and right, its middle halfway between its box's and its
  // area's (7.95 and 7.19), on the 16px square's, as it reads centred: its tip, the most of it, otherwise pulls it up and left.
  pointer: '<path d="M3.035 3.231 L7.254 13.543 C7.306 13.669 7.486 13.666 7.533 13.538 L9.126 9.215 C9.141 9.174 9.174 9.141 9.215 9.126 L13.538 7.533 C13.666 7.486 13.669 7.306 13.543 7.254 L3.231 3.035 C3.108 2.985 2.985 3.108 3.035 3.231 Z"/>',
  // Align left
  "align-left": '<line x1="2.25" y1="3.25" x2="13.75" y2="3.25"/><line x1="2.25" y1="6.375" x2="9.75" y2="6.375"/><line x1="2.25" y1="9.625" x2="13.75" y2="9.625"/><line x1="2.25" y1="12.75" x2="9.75" y2="12.75"/>',
  // Align center
  "align-center": '<line x1="2.25" y1="3.25" x2="13.75" y2="3.25"/><line x1="4.75" y1="6.375" x2="11.25" y2="6.375"/><line x1="2.25" y1="9.625" x2="13.75" y2="9.625"/><line x1="4.75" y1="12.75" x2="11.25" y2="12.75"/>',
  // Align right
  "align-right": '<line x1="2.25" y1="3.25" x2="13.75" y2="3.25"/><line x1="6.25" y1="6.375" x2="13.75" y2="6.375"/><line x1="2.25" y1="9.625" x2="13.75" y2="9.625"/><line x1="6.25" y1="12.75" x2="13.75" y2="12.75"/>',
  // Justify
  "align-justify": '<line x1="2.25" y1="3.25" x2="13.75" y2="3.25"/><line x1="2.25" y1="6.375" x2="13.75" y2="6.375"/><line x1="2.25" y1="9.625" x2="13.75" y2="9.625"/><line x1="2.25" y1="12.75" x2="13.75" y2="12.75"/>',
  // Arrow up to line
  promote: '<g transform="rotate(-90 8 8)"><line x1="2.5" y1="8" x2="10.5" y2="8"/><path d="M6.75 4.25 L10.5 8 L6.75 11.75"/><line x1="13.5" y1="3" x2="13.5" y2="13"/></g>',
  // Arrow up: a brief set (designer, 2026-11-10)
  "arrow-up": '<line x1="8" y1="13" x2="8" y2="3"/><path d="M3.75 7.25 L8 3 L12.25 7.25"/>',
  // Note
  brief: '<path d="M3 2.5 L13 2.5 C13.276 2.5 13.5 2.724 13.5 3 L13.5 9.5 L9.5 13.5 L3 13.5 C2.724 13.5 2.5 13.276 2.5 13 L2.5 3 C2.5 2.724 2.724 2.5 3 2.5 Z"/><path d="M13.5 9.5 L9.7 9.5 C9.59 9.5 9.5 9.59 9.5 9.7 L9.5 13.5"/>',
  /** The Brief tool: a note to add, the brief's note with a plus in it (designer, 2026-11-10). */
  "brief-add": '<path d="M3 2.5 L13 2.5 C13.276 2.5 13.5 2.724 13.5 3 L13.5 9.5 L9.5 13.5 L3 13.5 C2.724 13.5 2.5 13.276 2.5 13 L2.5 3 C2.5 2.724 2.724 2.5 3 2.5 Z"/><line x1="7.5" y1="5" x2="7.5" y2="10"/><line x1="5" y1="7.5" x2="10" y2="7.5"/>',
  // From the designer's panels in Figma (2026-11-07), drawn on 14px there: scaled to this square.
  "chevron-down": '<g transform="scale(1.142857)"><path d="M10.7188 5.14063L7 8.85938L3.28125 5.14063"/></g>',
  reset:
    '<g transform="translate(-3.75 -3.75)"><path d="M6.71875 11.75C6.71875 12.7451 7.01383 13.7178 7.56667 14.5452C8.11951 15.3726 8.90528 16.0175 9.82462 16.3983C10.744 16.7791 11.7556 16.8787 12.7315 16.6846C13.7075 16.4904 14.604 16.0113 15.3076 15.3076C16.0113 14.604 16.4904 13.7075 16.6846 12.7315C16.8787 11.7556 16.7791 10.744 16.3983 9.82462C16.0175 8.90528 15.3726 8.11951 14.5452 7.56667C13.7178 7.01383 12.7451 6.71875 11.75 6.71875C10.35 6.71875 9.0375 7.2875 8.03125 8.25L6.71875 9.5625"/><path d="M6.71875 6.71875V9.5625H9.5625"/></g>',
  eye: '<g transform="scale(1.142857)"><path d="M1.75 7C2.975 4.55 4.9 3.28125 7 3.28125C9.1 3.28125 11.025 4.55 12.25 7C11.025 9.45 9.1 10.7188 7 10.7188C4.9 10.7188 2.975 9.45 1.75 7Z"/><circle cx="7" cy="7" r="1.96875"/></g>',
  wrap: '<g transform="scale(1.142857)"><path d="M2.40625 8.3125H8.53125C9.34348 8.3125 10.1224 7.98984 10.6968 7.41551C11.2711 6.84118 11.5938 6.06223 11.5938 5.25C11.5938 4.43777 11.2711 3.65882 10.6968 3.08449C10.1224 2.51016 9.34348 2.1875 8.53125 2.1875H5.46875"/><path d="M5.25 11.1562L2.40625 8.3125L5.25 5.46875"/></g>',
  // Drawn for the Variables tab's search (2026-11-07), in IconMCP's manner, until the designer picks one of theirs.
  search: '<circle cx="7.25" cy="7.25" r="4.5"/><line x1="10.5" y1="10.5" x2="13.25" y2="13.25"/>',
};

export type IconName = keyof typeof ICONS;
