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

- **Kind**: what sort of change it is.
- **Layer**: the layer's name, its element as an opening tag, and its place on the page (layer names from the page down).
- **Location**: `file:line:column` of the JSX that writes the layer. **Not located** means the layer has no source marker: find it from its element and place on the page.
- **Scope**: which instances the change is for.
  - **This usage only**: change the layer where the component is used at the given place, and nowhere else. When the layer's code is inside a component used in several places, do not edit the component for everyone: change it at that usage (a prop, a `className` passed in, a variant), so the component's other usages stay as they are. All instances rendered from that one usage (a list, a loop) change together.
  - **Usage not determined**: the component's usage could not be located. Find the usage the layer is in from its place on the page, and change only that one.
- **Design intent**: what the designer wants, in design terms. This is the goal.
- **Reference style**: the CSS that showed the change on the canvas. Use it to understand the intent, not as code to paste.

## 3. Apply them, one at a time

For each change, in order:

1. Make the change in the source.
2. Right away, run `npx vernierkit done <number>` with the change's number. Do this after every change, not all at the end: it is how the designer sees your progress, and how the page stops previewing a change once it is in the code.

If a change cannot be applied exactly as asked, apply the closest you can and still run `done`; or leave it out and do not run `done` for it. Either way, report it (step 5).

While you apply them:

- **Follow how the project already writes styles.** With Tailwind, change the classes (`bg-red-500`, `rounded-sm`, an arbitrary value only when no class fits). With CSS files or CSS Modules, change the CSS rule that styles the element. Do not add inline styles unless the project already styles that element inline.
- **Change exactly the scope given**, no more and no less.
- **Never modify third-party dependencies** (anything in `node_modules`, or vendored packages). If a change can only be made inside one, do not make it: report it.

## 4. Finish

When you have been through every change, run:

```sh
npx vernierkit finish
```

It ends the round: the editor unlocks, and the page shows the code as it now is. It tells you which changes were never marked done.

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

It prints the notes of the round before, with each change marked **Applied** or **Not applied**. Take the applied ones back out of the source, as they were before (the notes give the earlier value as the design intent's "from"); leave the others alone. Then tell the designer what you reverted. There is nothing to claim or finish for an undo.
