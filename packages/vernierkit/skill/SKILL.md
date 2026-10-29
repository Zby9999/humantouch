---
name: vernierkit
description: Apply the design changes a designer made in Vernier Kit, the editor layer on this project's dev server, to the source code. Use when the designer asks to apply their design changes ("apply my design changes", "落地我的设计改动"), or to undo the last round of them.
---

# Applying Vernier Kit design changes

The designer edits the page in Vernier Kit, which saves every change to `.vernier/` in the project. You turn those changes into source code. There is nothing to copy or paste: the command line gives you everything.

## 1. Claim the changes

From the project root, run:

```sh
npx vernierkit claim
```

It claims the round and prints the change notes: one section per change, numbered. The designer's editor locks while you work, and a ring on its toggle fills as you report changes done. If it says there are no design changes to apply, tell the designer and stop.

Running `claim` again prints the notes once more, with the changes done so far.

## 2. Read each change

Every section has:

- **Kind**: what sort of change it is: **Style** (a property of the layer), or a move: **Reorder** (to another place among its container's layers), **Move** (into another container's layout) or **Absolute** (placed by coordinates in a container); or a change to the structure: **Make Stack** (layers wrapped in a new Stack, or a Frame made one), **Dissolve Stack** (a Stack made a Frame, its layers placed absolute in it), **New text** or **New Frame** (a layer the designer drew), **Text** (new words), **Delete**, **Duplicate** or **Put back** (a layer the designer had moved off the canvas, set aside beside it, put back onto it); or a **Brief** (what the designer wants achieved in a layer, in their words, where the Design panel has nothing to set it with).
- **Layer**: the layer's name, its element as an opening tag, and its place on the page (layer names from the page down).
- **Location**: `file:line:column` of the JSX that writes the layer. **Not located** means the layer has no source marker: find it from its element and place on the page. **New** means the layer is made this round, by the change it names: apply that one first, then change the layer where you wrote it.
- **Scope**: which instances the change is for.
  - **This usage only**: change the layer where the component is used at the given place, and nowhere else. When the layer's code is inside a component used in several places, do not edit the component for everyone: change it at that usage (a prop, a `className` passed in, a variant), so the component's other usages stay as they are. All instances rendered from that one usage (a list, a loop) change together.
  - **Usage not determined**: the component's usage could not be located. Find the usage the layer is in from its place on the page, and change only that one.
  - **The component itself**: the designer promoted the change to the component it names, so every usage of it shows the change. Change the component's own code where it writes the layer (the Location), not the usage the designer made it on, and not each usage one by one.
  - **Change it where it is written**: the component that writes the layer is used outside any other component, so there is no other usage to spare: change it at Location.
- **Breakpoint**: the widths the change applies at. **All breakpoints**: at every width. A width range (`below 640px`, `768px to 1023px`, with the media query it stands for): the designer made the change in a narrower view, for those widths only; its value before is what the layer showed at those widths. When the range's edges are the project's own breakpoints, the line says how the project writes it: Tailwind's variants (`max-sm:`, `md:max-lg:`, from the project's Tailwind theme), or the project's own media queries at each edge (`(max-width: 767px)`), read from its stylesheets.
- **Design intent**: what the designer wants, in design terms. This is the goal. Sizes are **Fixed** (a set size, border and padding included), **Hug** (fits its content) or **Fill** (takes the room its Stack gives it: grows along the Stack, stretches across it). A **Stack** lays its children out in a row or a column, with a gap, padding and alignment: a flex container. A **Grid** lays its children out in rows and columns, one to a cell, filled in the order they are written: a CSS grid container. Its changes are its number of columns, its row gap and its column gap, and the order of its layers (a **Reorder** to another cell, or a **Move** into one of its cells). A **fill** is the layer's background: a color, or a gradient with its stops at % or px along it, in the unit given. A linear gradient's angle turns as in CSS (90° runs left to right); a radial gradient is centered across and down the layer from its top left, and reaches out to a side or corner, or a radius across and one down (a circle when it is one length); "centered and sized as the page has it" keeps the center and size the code already writes. A **stroke** is its border: on every side, or on some sides only. A **corner radius** is one for all corners, or each corner its own (top-left, top-right, bottom-right, bottom-left). **Shadows** are box shadows: a drop shadow, or an inner shadow (`inset`), the first listed on top; a text layer's are drop shadows drawn as `text-shadow`, with no spread. A **layer blur** blurs the layer (`filter: blur()`), a **background blur** what is behind it (`backdrop-filter: blur()`). A text layer's **font** is a family the page already loads; the reference style gives the stack of fonts the page uses it in. A **line height** is Auto (`normal`), a length, or a % of the font size (a plain number such as `1.5` in CSS); a **letter spacing** is a length or a % of the font size (`em`). The **case** is as typed, upper, lower or title case (`text-transform`); the **decoration** an underline or a strikethrough (`text-decoration-line`).
- **Variables** (on changes to a color, a spacing, a corner radius, a font size or shadows, when the project has Variables): which of the project's Variables (its Tailwind theme, or its CSS variables) each part of the new value is, exactly, and how the code uses it: a Tailwind class (`bg-brand-500`, `pt-gutter`) or `var(--name)`. Where it says no Variable has the value, use the exact value (with Tailwind, an arbitrary value such as `pt-[23px]`); never a class or Variable whose value is only close to it.
- **The Frame's only text** (only on changes to the text styles of the words a Frame draws and nothing else, such as a button's): the text has no element of its own; the Layer names it as the text in its Frame. Write its text styles on the Frame's own element, the one the Layer gives, which its words inherit them from; do not wrap the text in an element for them.
- **Inline fragments** (only on some text changes): the change is made on the text layer as a whole, and the bold runs and links in it follow it. The fragments it names have a value of their own, which they keep: leave theirs as it is.
- **Copied breakpoints** (only on some copies): the layer, or a layer in it, has values of its own at narrower breakpoints, which the copy keeps. Each is listed with its width range, the layer it is on, and its value, and with the change that gave it while that change is still in the round.
- **Data change** (on some moves, new words, deletions and copies): the layer is one of the instances a loop renders, so its place, its words, or whether it is there at all, come from the data the loop goes through. Change the data, not the JSX.
- **Brief** (on a new Frame, on a copy of one, and on a **Brief** change): what the designer wants, in their words: on a new Frame or its copy, what to make in it; on a layer that is there, what to achieve in it.
- **Sketch** (on a new Frame with a brief, and on what is drawn in it): the text and Frames the designer drew in the Frame, with where they are, to show the layout they have in mind.
- **Source**, **Look** and **Edited off the canvas** (only on a put back): the JSX that wrote the layer, as it was when the designer moved it off the canvas, with where it was written then; how it looked off the canvas, as an HTML document with every style written onto it (its classes as they were in `data-vk-class`); and what the designer changed on it there, each as a change of its own would read.
- **Put back** (only on a deletion): the designer moved the layer off the canvas and put it back elsewhere in the same round, in the change named.
- **Wrap it** (only on some moves): the text runs on beside other elements, with no element of its own. Wrap it in a `<span>` and move that.
- **Join the layout** (only when making a Stack): some of the layers it takes in are placed absolute now. In the Stack, its layout places them: take their absolute positioning (`position`, `left`, `top`) off.
- **Drop the margins** (only when making a Stack): some of the layers it takes in have margins now. In the Stack, its gap (or its padding) holds that room, and a new Stack has no margin: take their margins off (`mt-4`, `margin-top`; **Currently set by** says what sets them), or the space between them is the gap and the margins added together.
- **Equal columns** (only when a Grid's number of columns changes): the columns are that many equal shares of the Grid's width, as `grid-template-columns: repeat(<n>, minmax(0, 1fr))` (Tailwind's `grid-cols-<n>`). Columns sized some other way now (fixed widths, `auto-fill`) become equal.
- **Gap apart** (only when a Grid's row gap or column gap changes): only that one changes. Where one value sets both now (`gap-4`, `gap: 1rem`), set the two apart.
- **Make it a Stack** (only on some changes): the layer is a plain top-to-bottom flow of blocks, which the editor shows as a vertical Stack. Turn it into a real Stack (a flex column, as in the reference style) as part of the change, and keep its children looking as they did: their margins no longer collapse in a flex container, so the spacing between them may need adjusting.
- **Reference style**: the CSS that showed the change on the canvas. Use it to understand the intent, not as code to paste.
- **Currently set by**: what sets the value now, as the browser resolves the page's styles: a class and its rule, a rule (with its CSS layer and file), the element's style attribute, or nothing (the browser default). A text style the layer inherits is set where it inherits it from (a rule on `body`, say): set it on the layer itself rather than change it there for all. Start from it: it tells you what to change.

## 3. Apply them, one at a time

For each change, in order:

1. Make the change in the source.
2. Right away, run `npx vernierkit done <number>` with the change's number. Do this after every change, not all at the end: it is how the designer sees your progress, and how the change is checked on the page while you still have it in mind.
3. Read what `done` says. It checks the change on the designer's open page:
   - **it shows the change**: go on to the next one.
   - **it does not show the change**: something overrides your edit; the output says what the page shows instead. Look again at **Currently set by**, fix it, and run `done` with the same number again. Go on only once it shows, or once you know it cannot: then report it.
   - **Not checked**: no page could check it (none is open, the layer is not on it now, or it could not be shown at the change's breakpoint), or the change is not one the page can tell (a new layer, a Stack made or dissolved, a move into another container, a copy, a layer put back, new words, a brief). Go on; it is not an error. For a brief, `done` says so at once: say in the report how you achieved it.

   A change at a breakpoint is checked at a width in its range: the page loads itself that wide, out of sight, when its window is not, so a change at `below 640px` is checked as a phone shows it. If it could not load in time, the change is **Not checked**.

   Of the changes to the structure, the page checks a **Reorder** by the order of the container's layers, an **Absolute** placement in the same container by where the layer is, and a **Delete** by the layer being gone.

If a change cannot be applied exactly as asked, apply the closest you can and still run `done`; or leave it out and do not run `done` for it. Either way, report it (step 5).

While you apply them:

- **Use the Variables the notes name.** When **Variables** names one, write the value through it: its Tailwind class, or `var()` in CSS, not the number or color it comes to. When it says no Variable has the value, write the exact value: do not round it to the nearest class or Variable, and do not judge a close one good enough.
- **Follow how the project already writes styles.** With Tailwind, change the classes (`bg-red-500`, `rounded-sm`, an arbitrary value when the notes say no Variable has the value, or, for what they name no Variables for, when no class fits). With CSS files or CSS Modules, change the CSS rule that styles the element. Do not add inline styles unless the project already styles that element inline.
- **CSS Modules**: the page has the class as the bundler renamed it (`Card-module__aGLaxq__card`, `Card_card__x1y2z`). The rule to change is the local name (`.card`) in the `.module.css` file the component at Location imports.
- **Change what sets the value now.** If it is a class, replace that class. If it is a rule, change the rule, or, when the rule is shared with elements outside the scope, override it for this layer only.
- **A rule in no CSS layer beats every class in a layer**, whatever their specificity. Tailwind v4 puts its utilities in a layer, so when the value is set by a rule in no CSS layer, adding a utility class will not show: change that rule, narrow it, or use the class's important form (`bg-blue-600!`) as a last resort.
- **Moves**: move the JSX itself, to the container and the place the design intent gives; for a data change, reorder the data instead. An **Absolute** layer is placed with `position: absolute` and the `left` / `top` given, in a container that is its positioning reference: if the container is not positioned yet, give it `position: relative` (`relative` in Tailwind).
- **Grids**: change the Grid's own classes or rule. Its number of columns is `grid-cols-<n>` in Tailwind, `grid-template-columns: repeat(<n>, minmax(0, 1fr))` in CSS; its row gap and column gap are `gap-y-*` and `gap-x-*` in Tailwind (from the project's spacing scale; an arbitrary value only when none fits), `row-gap` and `column-gap` in CSS. When `gap-*` (or `gap`) sets both now and only one changes, split it: `gap-4` with a row gap of 24px becomes `gap-x-4 gap-y-6`. At a breakpoint, the class takes the breakpoint's variant (`max-sm:grid-cols-2`, `sm:max-md:gap-x-2`), unless the Grid already has a class that holds at exactly those widths: change that one instead of adding another (in `grid-cols-1 sm:grid-cols-3`, `grid-cols-1` is the value below 640px, so two columns below 640px is `grid-cols-2 sm:grid-cols-3`). A layer moved to another cell is a **Reorder**: the Grid fills its cells in the order its layers are written, so move the JSX (or, for a data change, the item in the data) to the place given; do not place it with `grid-row`, `grid-column` or `order`.
- **Making a Stack**: for a new Stack, wrap the layers listed, in the order listed, in one new element (a `<div>`, unless the project has a Stack component it uses for this), placed where the design intent says; lay it out as a flex row or column with the gap, padding and alignment given. To make a Frame a Stack, make that element the flex container, and put its layers in the order listed. Keep each layer's own JSX as it is: only its place changes.
- **New text**: write the words given, where the design intent places them, in the style the page already gives its body text (the class or element it uses for paragraphs), not as the reference style's raw values unless nothing else fits.
- **New Frame**: an element of the size given, with no fill. When it has a **Brief**, make what the brief asks for in it: build it from the components and styles the project already has (its buttons, cards, type and colors), and lay it out as the **Sketch** shows; the sketch's own changes are a guide to that layout, not words and boxes to copy as they are. Say in the report what you made.
- **Brief** (a change of its own, on a layer that is there): achieve what the brief asks of that layer ("bounce back harder when pressed", "truncate the title past two lines"). It is the designer's intent, not a value: work out what it takes in the code (a style, a transition or animation, a state, a prop, a limit on the text), and do it the way the project already does such things, from its own components, styles and Variables, within the scope given. It holds at every width. `done` never checks it on the page: say in the report what you did to achieve it, under ✓ when you did, under ⚠️ when you could only come close or not at all.
- **Text**: change the words in the JSX, and keep the bold, links and other pieces around the words where they still fit. When the words come from a prop or a variable, change them where they are given.
- **Delete**: take the JSX of the layer out, with all in it. When its layers were moved out of it first (the designer ungrouped it: moves out of it, then its deletion), take out only its own element, its layers staying where those moves put them. **Duplicate**: copy the JSX of the layer, with all in it, to the place given. When it has **Copied breakpoints**, the copy has the values listed at those widths, as the layer had them when copied: copying the JSX with its responsive classes usually does it, but where a media query reaches the layer by something the copy does not share (an id, `:nth-child`), or the layer's value there has changed since, give the copy its own, written as **Breakpoint changes** are. When it has a **Brief** (a copy of a new Frame), make what the brief asks for in the copy too, as in the Frame it copies; a **Brief** change on the copy later replaces that brief (or, "none", takes it off: leave the copy a Frame as drawn).
- **Put back**: a layer the designer moved off the canvas comes back onto it, at the place given. Moved off in an earlier round, its code was deleted then: write its **Source** back as it is, where the design intent places it, adjusting it only where the code around it has changed since (a prop it took, an import it needs, a component renamed). Moved off this round (the intent names the deletion, which says **Put back** too), its code is still there: move it there instead, rather than deleting it and writing it again. Then make the **Edited off the canvas** changes to it, as those changes are written. Where its classes no longer give it the **Look** (their rules went with its code, a CSS file deleted say), give it styles that do, as the project writes styles. A layer with no **Source** kept (it was new when moved off) is written from its **Look**, as the project writes markup and styles.
- **Data changes**: when the data is written in the code (an array, a constant, a fixture), change it there: reorder it, change the item's words, take the item out, or add a copy of it. When it comes from outside the code (an API, a CMS, a database), do not fake it in the code: report it under ⚠️.
- **Dissolving a Stack**: take the flex layout off the element and give it the fixed size given, as the positioning reference (`position: relative`) of its layers; give each layer `position: absolute`, the `left` / `top` given and its size. The page should look the same afterwards.
- **Breakpoint changes**: make the change apply in its width range only, the way the project already writes breakpoints. When the **Breakpoint** line names how the project writes the range, use exactly that: the Tailwind variants given (`max-sm:bg-red-500`, `md:max-lg:p-4`; on Tailwind v3, `max-*` variants need v3.2 or later and screens given as plain widths, else write the range with the project's own screens another way), or a media query beside the rule that styles the layer in CSS files and CSS Modules, with the same edges as the project's media queries named (`@media (max-width: 767px)`). When it names none (the project had no breakpoint at an edge), use the project's breakpoint nearest to the range, and say in the report that the edges differ. Leave the layer as it is at every other width, and do not change the value it has at all breakpoints to get there. A layer hidden at a breakpoint is hidden there only (`max-md:hidden`, or `display: none` in the media query); a breakpoint that shows a layer hidden at every width gives it its display back there. A Style change to **Absolute** (a layer in its container's layout, placed freely in a narrower view) takes the layer out of the layout at those widths only: `position: absolute`, the `left` / `top` and the size given, in the media query or with the variant (`max-md:absolute max-md:left-3 max-md:top-10 max-md:w-[120px]`); its container becomes its positioning reference at those widths (`position: relative`, in the same media query or variant) where it is not one already.
- **Change exactly the scope given**, no more and no less: a change for **this usage only** changes that usage and nothing else; a change to **the component itself** changes the component, for every usage. Never widen a usage's change to the component because it is easier, nor make a component's change at one usage. When the value is set by a class inside a component used in several places and the scope is one usage, do not add a second, conflicting class at the usage (`rounded-xl rounded-sm`): make the component's class a default the usage can replace (a prop, or merging with the project's class-merging helper if it has one). When the same property has a change to the component and another for one usage, make both: the component's value for all, and that usage's in place of it there.
- **Never modify third-party dependencies** (anything in `node_modules`, or vendored packages). If a change can only be made inside one, do not make it: report it.

## 4. Finish

When you have been through every change, run:

```sh
npx vernierkit finish
```

It ends the round: the editor unlocks, and the page shows the code as it now is. It tells you which changes were never marked done, and which the page did not show: report both under ⚠️.

## 5. Report

End your reply with this report, in this form:

```
✓ Applied
- 1. Fill: the cards of the feature grid, white → red
- 2. Corner radius: …
- 3. Brief on Button: pressed, it shrinks a little and springs back (`active:scale-95` with a springy transition)

⚠️ Not applied 1:1
- 4. Corner radius: <which layer>
  Why: <the reason, e.g. the component library sets it and cannot be changed from the usage>
  Instead: <what you did, or "left as it was">
```

List every change under one of the two. Leave out the ⚠️ section only when every change was applied exactly. Keep each line short: the designer reads only the exceptions.

## Undoing the last round

When the designer asks to undo the last round of design changes, run:

```sh
npx vernierkit last
```

It prints the notes of the round before, with each change marked **Applied** or **Not applied**. In a git repository it also gives the exact code changes of that round, and a command that takes them back out:

1. Look at the diff first (the command it gives). It holds everything edited while the round was applied, so leave out anything that was not part of the design changes.
2. Apply the reverse, with the command it gives, or by hand for the parts you keep.

Without a diff, take the applied changes back out of the source by hand, as they were before (the notes give the earlier value as the design intent's "from"); leave the others alone.

Then tell the designer what you reverted. There is nothing to claim or finish for an undo.

## Removing Vernier Kit

When the designer or a developer asks to remove or uninstall Vernier Kit, run from the project root:

```sh
npx vernierkit remove
```

It takes back out everything `init` added (the plugin in the build config, `<Vernier />`, the package, this Skill, its line in AGENTS.md and in .gitignore) and deletes `.vernier/`, leaving the project as it was. It refuses while the designer has design changes not applied yet, or while a round is being applied: say so, and ask whether to apply them first or have the designer discard them. If it lists steps to finish by hand (lines changed since `init`), do them.
