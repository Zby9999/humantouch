/**
 * How to write a round's changes into the code, as the change notes end with
 * it (ticket 65, ADR 0013): the rules for every round, and those for each kind
 * of change the round has, each once. An Agent that never loaded the Skill
 * finds them all here; one that did reads only what this round needs.
 */
import type { Change, Created, Place } from "./client/changeset";

interface Rule {
  name: string;
  /** Whether the round has a change this rule is for. */
  for(list: Change[]): boolean;
  text: string;
}

const RULES: Rule[] = [
  {
    name: "Every change",
    for: () => true,
    text:
      "the design intent is the goal; the reference style is the CSS that showed it on the canvas, to understand it by, not code to paste. " +
      "Write it the way the project already writes code: with Tailwind, its classes; with CSS files or CSS Modules, the rule that styles the element; no inline style unless the project styles that element inline. " +
      "When a change cannot be applied exactly as asked, apply the closest you can, or leave it out, and report it either way. " +
      "Never change third-party code (`node_modules`, vendored packages): a change that can only be made there is left out and reported.",
  },
  {
    name: "What sets the value now",
    for: (list) => list.some((change) => change.kind === "style" || change.kind === "unstack"),
    text:
      "start from what **Currently set by** names, and change that: a class, replace it; a rule, change it, or, when the rule styles elements outside the scope too, override it for this layer only. " +
      "A text style the layer inherits (from a rule on `body`, say) is set on the layer itself, not changed there for all.",
  },
  {
    name: "All breakpoints",
    for: (list) => list.some((change) => change.kind === "style" && !change.breakpoint),
    text:
      "a change at all breakpoints, made in the desktop view, applies at every width, not only at the width the page is at. " +
      "Where the project already writes the property for some widths (a breakpoint variant such as `sm:` or `md:`, a media query), change those too, so every width shows the new value: " +
      "in `grid-cols-1 sm:grid-cols-3`, two columns at all breakpoints is `grid-cols-2`. " +
      "Widths a change of this round makes at a breakpoint of its own keep that change's value. " +
      "`done` checks it at the page's width and at each of the designer's views (a phone's, a tablet's), and names the width where it does not show.",
  },
  {
    name: "A rule in no CSS layer",
    for: (list) => list.some((change) => change.sources?.some((source) => source.kind === "rule" && source.layer === null)),
    text:
      "it beats every class in a CSS layer, whatever their specificity: Tailwind v4 puts its utilities in a layer, so a utility class added over it does not show. " +
      "Change that rule, narrow it, or, as a last resort, use the class's important form (`bg-blue-600!`).",
  },
  {
    name: "CSS Modules",
    for: (list) => list.some((change) => change.sources?.some((source) => /\.module\.(css|scss|sass|less)\b/.test(source.file ?? ""))),
    text:
      "the page has the class as the bundler renamed it (`Card-module__aGLaxq__card`, `Card_card__x1y2z`): change the rule of its local name (`.card`) in the `.module.css` file the component at Location imports.",
  },
  {
    name: "Breakpoints",
    for: (list) => list.some((change) => change.breakpoint || change.copiedBreakpoints?.length),
    text:
      "a change at a width range applies at those widths only: write it as its Breakpoint line says the project writes that range (the Tailwind variants given, `max-sm:bg-red-500`, `md:max-lg:p-4`; on Tailwind v3, `max-*` variants need v3.2 or later and screens given as plain widths; " +
      "or a media query beside the rule that styles the layer, with the edges named, `@media (max-width: 767px)`). When it names none, use the project's breakpoint nearest the range, and say in the report that the edges differ. " +
      "Leave the layer as it is at every other width, and do not change its value at all breakpoints to get there. Where it already has a class that holds at exactly those widths, change that one rather than add another " +
      "(in `grid-cols-1 sm:grid-cols-3`, `grid-cols-1` is the value below 640px, so two columns there is `grid-cols-2 sm:grid-cols-3`). " +
      "Hidden at a breakpoint is hidden there only (`max-md:hidden`, or `display: none` in the media query); a layer hidden at every width that a breakpoint shows gets its display back there.",
  },
  {
    name: "Absolute at a breakpoint",
    for: (list) => list.some((change) => change.kind === "style" && change.property === "absolute"),
    text:
      "the layer leaves its container's layout at those widths only: `position: absolute`, the `left` / `top` and the size given, in the media query or with the variant (`max-md:absolute max-md:left-3 max-md:top-10 max-md:w-[120px]`); " +
      "its container becomes its positioning reference at those widths (`position: relative`, the same way) where it is not one already.",
  },
  {
    name: "This usage only",
    for: (list) => list.some((change) => change.scope !== "component" && forOneUsage(change)),
    text:
      "change the layer at the usage given (a prop, a `className` passed in, a variant), not the component for every usage; all the instances that one usage renders (a loop) change together. " +
      "When a class inside the component sets the value, do not add a second, conflicting class at the usage (`rounded-xl rounded-sm`): make the component's class a default the usage can replace (a prop, or the project's class-merging helper, if it has one).",
  },
  {
    name: "The component itself",
    for: (list) => list.some((change) => change.scope === "component"),
    text:
      "change the component's own code where it writes the layer (Location), so every usage shows it: not the usage the designer made it on, and not each usage one by one. " +
      "When the same property has a change to the component and another for one usage, make both: the component's value for all, and that usage's in place of it there.",
  },
  {
    name: "Moves",
    for: (list) => list.some((change) => change.kind === "move"),
    text:
      "move the JSX itself, to the container and the place the design intent gives; for a data change, the item in the data instead. " +
      "A layer placed absolute gets `position: absolute` and the `left` / `top` given, in a container that is its positioning reference: give the container `position: relative` (`relative`) if it is not positioned yet.",
  },
  {
    name: "Cells of a Grid",
    for: (list) => list.some((change) => change.kind === "move" && (change.after as Place).container.grid),
    text: "a Grid fills its cells in the order its layers are written: put the JSX (or, for a data change, the item in the data) at the place given; do not place it with `grid-row`, `grid-column` or `order`.",
  },
  {
    name: "Grids",
    for: (list) => list.some((change) => change.kind === "style" && ["columns", "rowGap", "columnGap"].includes(change.property)),
    text:
      "change the Grid's own classes or rule; its gaps from the project's spacing scale (an arbitrary value only when none fits). " +
      "Where one value sets both gaps now, split it: `gap-4` with a row gap of 24px becomes `gap-x-4 gap-y-6`.",
  },
  {
    name: "Making a Stack",
    for: (list) => list.some((change) => change.kind === "stack"),
    text:
      "for a new Stack, wrap the layers listed, in the order listed, in one new element (a `<div>`, unless the project has a Stack component it uses for this), placed where the design intent says, laid out as a flex row or column with the gap, padding and alignment given. " +
      "To make a Frame a Stack, make its element the flex container, its layers in the order listed. Keep each layer's own JSX as it is: only its place changes.",
  },
  {
    name: "Make it a Stack",
    for: (list) => list.some((change) => change.asStack),
    text: "keep its children looking as they did: their margins no longer collapse in a flex container, so the spacing between them may need adjusting.",
  },
  {
    name: "Dissolving a Stack",
    for: (list) => list.some((change) => change.kind === "unstack"),
    text:
      "take the flex layout off the element and give it the fixed size given, as the positioning reference (`position: relative`) of its layers; give each layer `position: absolute`, the `left` / `top` given and its size. " +
      "The page should look the same afterwards.",
  },
  {
    name: "Sizes",
    for: (list) => list.some((change) => change.kind === "style" && ["width", "height"].includes(change.property)),
    text: "Fixed is a set size, border and padding included; Hug fits its content; Fill takes the room its Stack gives it: it grows along the Stack, and stretches across it.",
  },
  {
    name: "New Frame with a brief",
    for: (list) => list.some((change) => (change.kind === "create" && !!(change.after as Created).brief) || (change.kind === "duplicate" && !!change.brief)),
    text:
      "build what the brief asks for from the components and styles the project already has (its buttons, cards, type and colors), laid out as the sketch shows: the sketch is a guide to the layout, not words and boxes to copy. " +
      "Say in the report what you made.",
  },
  {
    name: "Brief",
    for: (list) => list.some((change) => change.kind === "brief"),
    text:
      "achieve what it asks of the layer (“bounce back harder when pressed”, “truncate the title past two lines”): work out what it takes in the code (a style, a transition or animation, a state, a prop, a limit on the text), " +
      "and do it the way the project already does such things, from its own components, styles and Variables, within the scope given, at every width. " +
      "`done` never checks it on the page: say in the report what you did, under ✓ when you did, under ⚠️ when you could only come close or not at all.",
  },
  {
    name: "Text",
    for: (list) => list.some((change) => change.kind === "text"),
    text: "change the words in the JSX, and keep the bold, links and other pieces around them where they still fit. When the words come from a prop or a variable, change them where they are given.",
  },
  {
    name: "Copies",
    for: (list) => list.some((change) => change.kind === "duplicate" && change.copiedBreakpoints?.length),
    text:
      "copying the JSX with its responsive classes usually gives the copy the values listed at those widths. Where a media query reaches the layer by something the copy does not share (an id, `:nth-child`), " +
      "or the layer's value there has changed since, give the copy its own, written as breakpoint changes are.",
  },
  {
    name: "Data changes",
    for: (list) => list.some((change) => change.data),
    text:
      "when the data is written in the code (an array, a constant, a fixture), change it there. When it comes from outside the code (an API, a CMS, a database), do not fake it in the code: report it under ⚠️.",
  },
];

/**
 * Whether the change is for one usage of a component, the others to stay as
 * they are: not one with no component, nor one written by a component used
 * outside any other (the notes' Scope line says it is changed where it is written).
 */
function forOneUsage({ target: { chain } }: Change): boolean {
  const [own, ...outer] = chain;
  return !!own && !(own.usage && !outer.length);
}

/** The **How to write them** section of a round's notes: the rules its changes call for. */
export function writingRules(list: Change[]): string {
  const rules = RULES.filter((rule) => rule.for(list));
  return `## How to write them\n\n${rules.map((rule) => `- **${rule.name}:** ${rule.text}\n`).join("")}`;
}

/**
 * The report the Agent ends its reply with, as `finish` gives it and the
 * Skill has it: the designer reads only the exceptions.
 */
export const REPORT_FORM = `End your reply with this report:

\`\`\`
✓ Applied
- 1. Fill: the cards of the feature grid, white → red
- 2. Brief on Button: pressed, it shrinks a little and springs back (\`active:scale-95\` with a springy transition)

⚠️ Not applied 1:1
- 3. Corner radius: <which layer>
  Why: <the reason, e.g. the component library sets it and cannot be changed from the usage>
  Instead: <what you did, or “left as it was”>
\`\`\`

- List every change once, under one heading only. One applied, but not exactly as asked, goes under ⚠️ alone, not under ✓ as well; more to say of one applied exactly goes on its ✓ line.
- Give each change under ⚠️ both lines, Why and Instead.
- Leave the ⚠️ section out only when every change was applied exactly. Keep each line short.
`;
