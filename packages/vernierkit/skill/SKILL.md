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

It claims the round, so the designer cannot edit while you work, and prints the change notes: one section per change. If it says there are no design changes to apply, tell the designer and stop.

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

## 3. Apply them

- **Follow how the project already writes styles.** With Tailwind, change the classes (`bg-red-500`, `rounded-sm`, an arbitrary value only when no class fits). With CSS files or CSS Modules, change the CSS rule that styles the element. Do not add inline styles unless the project already styles that element inline.
- **Change exactly the scope given**, no more and no less.
- **Never modify third-party dependencies** (anything in `node_modules`, or vendored packages). If a change can only be made inside one, do not make it: report it.
