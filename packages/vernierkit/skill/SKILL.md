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

- **Kind**: what sort of change it is: **Style** (a property of the layer), or a move: **Reorder** (to another place among its container's layers), **Move** (into another container's layout) or **Absolute** (placed by coordinates in a container).
- **Layer**: the layer's name, its element as an opening tag, and its place on the page (layer names from the page down).
- **Location**: `file:line:column` of the JSX that writes the layer. **Not located** means the layer has no source marker: find it from its element and place on the page.
- **Scope**: which instances the change is for.
  - **This usage only**: change the layer where the component is used at the given place, and nowhere else. When the layer's code is inside a component used in several places, do not edit the component for everyone: change it at that usage (a prop, a `className` passed in, a variant), so the component's other usages stay as they are. All instances rendered from that one usage (a list, a loop) change together.
  - **Usage not determined**: the component's usage could not be located. Find the usage the layer is in from its place on the page, and change only that one.
- **Design intent**: what the designer wants, in design terms. This is the goal. Sizes are **Fixed** (a set size, border and padding included), **Hug** (fits its content) or **Fill** (takes the room its Stack gives it: grows along the Stack, stretches across it). A **Stack** lays its children out in a row or a column, with a gap, padding and alignment: a flex container.
- **Data change** (only on some moves): the layer is one of the instances a loop renders, so its order is the order of the data. Change the data, not the JSX.
- **Wrap it** (only on some moves): the text runs on beside other elements, with no element of its own. Wrap it in a `<span>` and move that.
- **Make it a Stack** (only on some changes): the layer is a plain top-to-bottom flow of blocks, which the editor shows as a vertical Stack. Turn it into a real Stack (a flex column, as in the reference style) as part of the change, and keep its children looking as they did: their margins no longer collapse in a flex container, so the spacing between them may need adjusting.
- **Reference style**: the CSS that showed the change on the canvas. Use it to understand the intent, not as code to paste.
- **Currently set by**: what sets the value now, as the browser resolves the page's styles: a class and its rule, a rule (with its CSS layer and file), the element's style attribute, or nothing (the browser default). Start from it: it tells you what to change.

## 3. Apply them, one at a time

For each change, in order:

1. Make the change in the source.
2. Right away, run `npx vernierkit done <number>` with the change's number. Do this after every change, not all at the end: it is how the designer sees your progress, and how the page stops previewing a change once it is in the code.
3. Read what `done` says. It checks the change on the designer's open page:
   - **it shows the change**: go on to the next one.
   - **it does not show the change**: something overrides your edit; the output says what the page shows instead. Look again at **Currently set by**, fix it, and run `done` with the same number again. Go on only once it shows, or once you know it cannot: then report it.
   - **Not checked**: no page could check it (none is open, or the layer is not on it now). Go on; it is not an error.

If a change cannot be applied exactly as asked, apply the closest you can and still run `done`; or leave it out and do not run `done` for it. Either way, report it (step 5).

While you apply them:

- **Follow how the project already writes styles.** With Tailwind, change the classes (`bg-red-500`, `rounded-sm`, an arbitrary value only when no class fits). With CSS files or CSS Modules, change the CSS rule that styles the element. Do not add inline styles unless the project already styles that element inline.
- **Change what sets the value now.** If it is a class, replace that class. If it is a rule, change the rule, or, when the rule is shared with elements outside the scope, override it for this layer only.
- **A rule in no CSS layer beats every class in a layer**, whatever their specificity. Tailwind v4 puts its utilities in a layer, so when the value is set by a rule in no CSS layer, adding a utility class will not show: change that rule, narrow it, or use the class's important form (`bg-blue-600!`) as a last resort.
- **Moves**: move the JSX itself, to the container and the place the design intent gives; for a data change, reorder the data instead. An **Absolute** layer is placed with `position: absolute` and the `left` / `top` given, in a container that is its positioning reference: if the container is not positioned yet, give it `position: relative` (`relative` in Tailwind).
- **Change exactly the scope given**, no more and no less. When the value is set by a class inside a component used in several places and the scope is one usage, do not add a second, conflicting class at the usage (`rounded-xl rounded-sm`): make the component's class a default the usage can replace (a prop, or merging with the project's class-merging helper if it has one).
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

⚠️ Not applied 1:1
- 3. Corner radius: <which layer>
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
