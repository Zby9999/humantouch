/**
 * How to write a round's changes into the code, as the change notes end with
 * it (ticket 65, ADR 0013): the rules for every round, and those for each kind
 * of change the round has, each once. An Agent that never loaded the Skill
 * finds them all here; one that did reads only what this round needs.
 */
import { drawnIn, type Change, type Created, type Place } from "./client/changeset";
import { checkable, PLACING } from "./client/checkable";
import type { Property } from "./client/property-table";
import { listed } from "./design-values";

/** How to write one kind of change: its name in the notes, the changes it is for, and what it says. */
interface HowToWrite {
  name: string;
  /** Whether `change` is one it is for: it is said when the round has one. */
  calledFor(change: Change): boolean;
  /** What it says, or, where that depends on the round, what it says for the round's changes. */
  text: string | ((list: Change[]) => string);
}

const HOW_TO_WRITE: HowToWrite[] = [
  {
    name: "Every change",
    calledFor: () => true,
    text:
      "the design intent is the goal; the reference style is the CSS that showed it on the canvas, to understand it by, not code to paste. " +
      "Write it the way the project already writes code: with Tailwind, its classes; with CSS files or CSS Modules, the rule that styles the element; no inline style unless the project styles that element inline. " +
      "When a change cannot be applied exactly as asked, apply the closest you can and still run `done` for it, or leave it out and do not; report it either way. " +
      "Never change third-party code (`node_modules`, vendored packages): a change that can only be made there is left out and reported.",
  },
  {
    name: "What sets the value now",
    calledFor: (change) => change.kind === "style" || change.kind === "unstack" || (change.kind === "stack" && !!change.sources?.length),
    text:
      "start from what **Currently set by** names, and change that: a class, replace it; a rule, change it only when every element it styles is in the scope, " +
      "and when it styles elements outside the scope too, leave it as it is and override it for this layer only (with Tailwind, a class on the layer; with CSS files or CSS Modules, a rule for the layer's own class). " +
      "A text style the layer inherits (from a rule on `body`, say) is set on the layer itself, not changed there for all.",
  },
  {
    name: "All breakpoints",
    calledFor: (change) => change.kind === "style" && !change.breakpoint,
    text:
      "a change at all breakpoints, made in the desktop view, applies at every width, not only at the width the page is at. " +
      "Where the project already writes the property for some widths (a breakpoint variant such as `sm:` or `md:`, a media query), change those too, so every width shows the new value: " +
      "in `grid-cols-1 sm:grid-cols-3`, two columns at all breakpoints is `grid-cols-2`. " +
      "Widths a change of this round makes at a breakpoint of its own keep that change's value.",
  },
  {
    name: "A rule in no CSS layer",
    calledFor: (change) => !!change.sources?.some((source) => source.kind === "rule" && source.layer === null),
    text:
      "it beats every class in a CSS layer, whatever their specificity. Tailwind v4 puts its utilities in one, so a utility class added over the rule does not show: " +
      "one that overrides it for this layer only takes its important form (`bg-[#2563EB]!`, `rounded-lg!`).",
  },
  {
    name: "CSS Modules",
    calledFor: (change) => !!change.sources?.some((source) => /\.module\.(css|scss|sass|less)\b/.test(source.file ?? "")),
    text:
      "the page has the class as the bundler renamed it (`Card-module__aGLaxq__card`, `Card_card__x1y2z`): change the rule of its local name (`.card`) in the `.module.css` file the component at Location imports.",
  },
  {
    name: "Breakpoints",
    calledFor: (change) => !!change.breakpoint || !!change.copiedBreakpoints?.length,
    text:
      "a change at a width range applies at those widths only: write it as its Breakpoint line says the project writes that range (with Tailwind, the variant given, as a prefix to the class; on Tailwind v3, `max-*` variants need v3.2 or later and screens given as plain widths; " +
      "with CSS, a media query beside the rule that styles the layer, with the edges named). When it names none, use the project's breakpoint nearest the range, and say in the report that the edges differ. " +
      "Leave the layer as it is at every other width, and do not change its value at all breakpoints to get there. " +
      "Where the design intent gives the range part by part, the layer shows another value in each now, each set by a class or rule of its own: change them so every part shows the new value. " +
      "A class that holds at exactly the widths of the range, or of a part, is changed rather than another added beside it. " +
      "With Tailwind, of the classes for a property that hold at a width, the one latest in the stylesheet shows, whatever their order in `class`: " +
      "those with no breakpoint variant come first, then the `max-*` ones from the widest, then `sm:`, `md:` and on up, each directly followed by the ranges that start there (`sm:max-lg:`). " +
      "Hidden at a breakpoint is hidden there only (`display: none` at those widths); a layer hidden at every width that a breakpoint shows gets its display back there.",
  },
  {
    name: "Absolute at a breakpoint",
    calledFor: (change) => change.kind === "style" && change.property === "absolute",
    text:
      "the layer leaves its container's layout at those widths only: `position: absolute`, the `left` / `top` and the size given, in the media query or with the variant given on each class; " +
      "its container becomes its positioning reference at those widths (`position: relative`, the same way) where it is not one already.",
  },
  {
    name: "This usage only",
    calledFor: (change) => change.scope !== "component" && forOneUsage(change),
    text:
      "change the layer at the usage given (a prop, a `className` passed in, a variant), not the component for every usage; all the instances that one usage renders (a loop) change together. " +
      "When a class inside the component sets the value, do not add a second, conflicting class at the usage (`rounded-xl rounded-sm`): make the component's class a default the usage can replace (a prop, or the project's class-merging helper, if it has one).",
  },
  {
    name: "The component itself",
    calledFor: (change) => change.scope === "component",
    text:
      "change the component's own code where it writes the layer (Location), so every usage shows it: not the usage the designer made it on, and not each usage one by one. " +
      "When the same property has a change to the component and another for one usage, make both: the component's value for all, and that usage's in place of it there.",
  },
  {
    name: "Moves",
    calledFor: (change) => change.kind === "move",
    text:
      "move the JSX itself, to the container and the place the design intent gives; for a data change, the item in the data instead. " +
      "A layer placed absolute gets `position: absolute` and the `left` / `top` given, in a container that is its positioning reference: give the container `position: relative` (`relative`) if it is not positioned yet.",
  },
  {
    name: "Cells of a Grid",
    calledFor: (change) => change.kind === "move" && !!(change.after as Place).container.grid,
    text: "a Grid fills its cells in the order its layers are written: put the JSX (or, for a data change, the item in the data) at the place given; do not place it with `grid-row`, `grid-column` or `order`.",
  },
  {
    name: "Grids",
    calledFor: (change) => change.kind === "style" && ["columns", "rowGap", "columnGap"].includes(change.property),
    text:
      "change the Grid's own classes or rule; its gaps from the project's spacing scale (an arbitrary value only when none fits). " +
      "Where one value sets both gaps now, split it: `gap-4` with a row gap of 24px becomes `gap-x-4 gap-y-6`.",
  },
  {
    name: "Making a Stack",
    calledFor: (change) => change.kind === "stack",
    text:
      "for a new Stack, wrap the layers listed, in the order listed, in one new element (a `<div>`, unless the project has a Stack component it uses for this), placed where the design intent says, laid out as a flex row or column with the gap, padding and alignment given. " +
      "To make a Frame a Stack, make its element the flex container, its layers in the order listed. Keep each layer's own JSX as it is: only its place changes.",
  },
  {
    name: "Make it a Stack",
    calledFor: (change) => !!change.asStack || !!change.copiedBreakpoints?.some((copy) => copy.asStack),
    text: "keep its children looking as they did: their margins no longer collapse in a flex container, so the spacing between them may need adjusting.",
  },
  {
    name: "Dissolving a Stack",
    calledFor: (change) => change.kind === "unstack",
    text:
      "take the flex layout off the element and give it the fixed size given, as the positioning reference (`position: relative`) of its layers; give each layer `position: absolute`, the `left` / `top` given and its size. " +
      "The page should look the same afterwards.",
  },
  {
    name: "Sizes",
    calledFor: (change) =>
      (change.kind === "style" && ["width", "height", "absolute"].includes(change.property)) || change.kind === "unstack" || (change.kind === "create" && (change.after as Created).type === "frame"),
    text: "Fixed is a set size, border and padding included; Hug fits its content; Fill takes the room its Stack gives it: it grows along the Stack, and stretches across it.",
  },
  {
    name: "New Frame with a brief",
    calledFor: (change) => (change.kind === "create" && !!(change.after as Created).brief) || (change.kind === "duplicate" && !!change.brief),
    text: (list) => {
      // A sketch is named only where one is drawn: an Agent told of one went looking for it (ticket 65).
      const frames = list.filter((change) => change.kind === "create" && !!(change.after as Created).brief);
      const sketched = frames.filter((frame) => drawnIn(frame.layer, list).length);
      const build = "build what the brief asks for from the components and styles the project already has (its buttons, cards, type and colors), ";
      const report = "Say in the report what you made.";
      if (!sketched.length) return `${build}laid out within the Frame's size as the brief says. ${report}`;
      const unsketched = sketched.length < frames.length ? "A Frame with nothing drawn in it is laid out within its size as the brief says. " : "";
      return `${build}laid out as the sketch shows: the sketch is a guide to the layout, not words and boxes to copy. ${unsketched}${report}`;
    },
  },
  {
    name: "Brief",
    calledFor: (change) => change.kind === "brief",
    text:
      "achieve what it asks of the layer (“bounce back harder when pressed”, “truncate the title past two lines”): work out what it takes in the code (a style, a transition or animation, a state, a prop, a limit on the text), " +
      "and do it the way the project already does such things, from its own components, styles and Variables, within the scope given, at every width. " +
      "`done` never checks it on the page: say in the report what you did, under ✓ when you did, under ⚠️ when you could only come close or not at all.",
  },
  {
    name: "Text",
    calledFor: (change) => change.kind === "text",
    text: "change the words in the JSX, and keep the bold, links and other pieces around them where they still fit. When the words come from a prop or a variable, change them where they are given.",
  },
  {
    name: "Copies",
    calledFor: (change) => !!change.copiedBreakpoints?.length,
    text:
      "copying the JSX with its responsive classes usually gives the copy the values listed at those widths. Where a media query reaches the layer by something the copy does not share (an id, `:nth-child`), " +
      "or the layer's value there has changed since, give the copy its own, written as breakpoint changes are.",
  },
  {
    name: "Data changes",
    calledFor: (change) => !!change.data,
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

/** How the page checks one kind of change (ticket 65): what it reads, and where, said once for the changes it is for. */
interface HowChecked {
  calledFor(change: Change): boolean;
  text: string;
}

/** A layer placed absolute, as the page checks it: where it is drawn. */
const placing = (change: Change) => (change.kind === "style" && PLACING.includes(change.property as Property)) || (change.kind === "move" && !!(change.after as Place).absolute);

/** What the page reads, and where, kind by kind, in the order said. */
const HOW_CHECKED: HowChecked[] = [
  {
    calledFor: (change) => checkable(change) && change.kind === "style" && !placing(change),
    text:
      "a style change by the value the browser computes (`getComputedStyle`) for the CSS its reference style names, on the layer in every instance, whatever class or rule gives it, and on nothing else: " +
      "an edit that also changes elements outside the scope is wrong, though `done` says it shows",
  },
  {
    calledFor: (change) => checkable(change) && change.kind === "style" && !change.breakpoint,
    text: "a change at all breakpoints at the page's own width and at each of the designer's views' widths (a phone's, a tablet's), but where this round changes it at a breakpoint of its own",
  },
  {
    calledFor: (change) => checkable(change) && !!change.breakpoint,
    text:
      "a change at a breakpoint in each part the project's breakpoints cut its range into (the design intent names them when their values differ): at the page's own width in the part its window is in, else at the part's lower edge, or, for one from no width at all, 1px under its upper edge",
  },
  {
    calledFor: (change) => checkable(change) && placing(change),
    text: "a layer placed absolute by where it is drawn: `position: absolute`, its container its positioning reference, its `left` and `top` the X and Y given, its margins kept, not taken off, so drawn at `left` and `top` plus its margins, as on the canvas",
  },
  { calledFor: (change) => checkable(change) && change.kind === "move" && !placing(change), text: "a reorder by the order of its container's layers" },
  { calledFor: (change) => checkable(change) && change.kind === "delete", text: "a deletion by the layer being gone, or not displayed, while its container is there" },
];

/** A move of a layer the page can find that it still cannot check (`checkable`). */
const movedUnchecked = (change: Change) => change.kind === "move" && !change.data && !change.target.made && !!change.target.loc && !checkable(change);
/** A move that leaves the layer in a container the page has no marker to find by: one made this round, or one with no source marker. */
function inUnfoundContainer({ before, after }: Change): boolean {
  const { container } = after as Place;
  return (before as Place).container.layer === container.layer && (!!container.target.made || !container.target.loc);
}

/** The kinds of change the page cannot check, as the rule names them, in this order. */
const UNCHECKED: [string, (change: Change) => boolean][] = [
  ["a change to one of a loop's instances alone", (change) => !!change.data],
  ["a change to a layer made this round", (change) => !change.data && !!change.target.made && change.kind !== "create"],
  ["a change to a layer the page cannot find", (change) => !change.data && !change.target.made && (!change.target.loc || change.target.run !== undefined) && change.kind !== "brief"],
  ["a new layer", (change) => change.kind === "create" || change.kind === "putBack"],
  ["a Stack made or dissolved", (change) => change.kind === "stack" || change.kind === "unstack"],
  ["a move into another container, or into a layout from a place of its own", (change) => movedUnchecked(change) && !inUnfoundContainer(change)],
  ["a move in a container made this round, or one the page cannot find", (change) => movedUnchecked(change) && inUnfoundContainer(change)],
  ["a copy", (change) => change.kind === "duplicate" && !change.data],
  ["new words", (change) => change.kind === "text" && !change.data],
  ["a brief", (change) => change.kind === "brief"],
];

/** The **How the page checks** rule: for the kinds of change of the round, each once (ticket 65). */
function howChecked(list: Change[]): string {
  const said = HOW_CHECKED.filter((how) => list.some(how.calledFor)).map((how) => how.text);
  const unchecked = UNCHECKED.filter(([, of]) => list.some(of)).map(([name]) => name);
  if (unchecked.length) said.push(`${listed(unchecked)}, not at all: \`done\` says Not checked, which is no error; say in the report what you did`);
  const shows = list.some(checkable) ? " Where it does not show, `done` says what the page shows instead, and at which width: you need not look further for how it checks." : "";
  return `the page reads ${said.join("; ")}.${shows}`;
}

/** The **How to write them** section of a round's notes: the rules its changes call for, and how the page checks them. */
export function writingRules(list: Change[]): string {
  const called = HOW_TO_WRITE.filter((how) => list.some(how.calledFor)).map((how) => ({ name: how.name, text: typeof how.text === "string" ? how.text : how.text(list) }));
  called.push({ name: "How the page checks", text: howChecked(list) });
  return `## How to write them\n\n${called.map((how) => `- **${how.name}:** ${how.text}\n`).join("")}`;
}

