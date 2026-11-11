/**
 * The changelog, newest first: a short title, its date, and one line on what it lets the designer do. The home page
 * shows the first three, the changelog page all (designer, 2026-11-12).
 */
export const UPDATES: { title: string; date: string; body: string }[] = [
  {
    title: "Edit alone",
    date: "2026-11-11",
    body: "Select one item of a list and press Edit alone: your changes stay on it, and the rest follow as before.",
  },
  {
    title: "Web Components",
    date: "2026-11-11",
    body: "Layers inside open shadow roots show on the canvas, in the Layers and in the Design panel, like any other.",
  },
  {
    title: "Your project's fonts",
    date: "2026-11-11",
    body: "The font and weight menus list every face your project declares, whether the page has loaded it yet or not.",
  },
  {
    title: "Brief cards",
    date: "2026-11-10",
    body: "Pick the Brief tool (B), click a layer, and write what your Agent should achieve there, on a card beside the views.",
  },
  {
    title: "Grid",
    date: "2026-11-10",
    body: "Turn a Stack into a Grid and back, or select loose layers in two rows and two columns and press ⇧A to make one.",
  },
  {
    title: "Off-canvas layers",
    date: "2026-11-10",
    body: "Drag a layer off the canvas to keep it beside the views, across rounds, and put it back whenever you want.",
  },
  {
    title: "Copy and paste style",
    date: "2026-11-10",
    body: "⌥⌘C copies a layer's style and ⌥⌘V pastes it onto the selection, all of it undone in one step.",
  },
  {
    title: "Variables from your code",
    date: "2026-11-10",
    body: "The Design panel shows the Variable your code writes a value with, in the view you work in.",
  },
  {
    title: "Auto margins",
    date: "2026-11-05",
    body: "Layers centered with auto margins stay centered and keep their size as you move and resize them.",
  },
  {
    title: "Text checks",
    date: "2026-11-04",
    body: "The page checks the text changes your Agent applies, as it checks every other change.",
  },
  {
    title: "Right-to-left pages",
    date: "2026-11-04",
    body: "On a right-to-left page, X and the handles follow the side each layer starts from.",
  },
];
