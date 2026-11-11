# Human Touch

An editor layer for your project's local dev server: edit the page itself, visually, on a canvas, then have your Agent write the changes into the code.

Human Touch is for designers. You give your Agent the short install steps under [For Agents](#for-agents) below, and a round button appears at the bottom right of your page: the toggle. Click it, and the page freezes into a canvas, where you move, resize and restyle what is on it by hand, without touching the code. Every change is saved into the project as you make it. When you are done, tell your Agent "Apply my design changes": it writes them into the source code, the page checks that each one shows, and the Agent reports any it could not apply 1:1.

There is no send button, nothing to copy and paste, and nothing to set up in your Agent. Any coding Agent that can read files, run commands and edit code can apply your changes, such as Claude Code, Cursor or Codex.

## Projects it works with

- React 18 or 19, with Vite, or with Next.js 16 or later and its App Router (Turbopack or webpack).
- Styles in Tailwind CSS v3 or v4, plain CSS, or CSS Modules.
- Your project's own colors, spacing and type sizes, offered as Variables in the Design panel, from its CSS variables, Tailwind v4 theme or Tailwind v3 config.

Human Touch runs only on your local dev server. It needs no account, and a production build has none of it in it: `npx humantouch doctor` checks that.

## For Agents

Copy this to your Agent, in the project you want to edit:

```text
Install Human Touch, an editor layer for this project's dev server, so I can edit the page and hand you the changes:

1. In the project's root folder, run `npx -y humantouch@latest init`. If it prints "Finish by hand", make those edits. If it stops with an error instead, do what the error says; if you cannot, tell me why.
2. Start the dev server with the command `init` printed (if it printed none, the project's own `dev` script) and leave it running.
3. If you can open a browser, open the page it serves and confirm the Human Touch toggle is at its bottom right: a round button named "Human Touch: enter edit mode". If you cannot, do not stop or wait for me: go on, and when you are done, tell me that the next time I open the page there should be a round button at its bottom right, and to tell you if it is not there.
4. Run `npx humantouch doctor`. Fix whatever it marks ✗ and run it again, until it says "All good."
```

`init` edits two files of your project's source, an import and a line in each: the build config (such as `vite.config.ts` or `next.config.ts`), and the file that renders the app (such as `src/main.tsx` or `app/layout.tsx`), which puts the toggle on the page. It also installs `humantouch` as a dev dependency, adds a Skill for your Agent in `.agents/skills/humantouch/` and `.claude/skills/humantouch/`, a line in `AGENTS.md` pointing to it, and a line in `.gitignore` for `.humantouch/`, the folder your changes are saved in.

## One round

### 1. Preview

Use the page as you always do, and bring it to the state you want to change: open the menu, scroll to the section, fill in the form. The toggle sits at the bottom right; drag it to any other corner if it is in the way.

### 2. Edit

Click the toggle. The page freezes into a canvas, shown side by side in the Desktop, Tablet and Phone views, with the Layers panel on the left and the Design panel on the right.

- Drag layers to move them, or move them off the canvas: they stay beside it as off-canvas layers, for you to put back later. Select a few and press ⇧A to make a Stack.
- Set Position, Size, Layout, Padding, Fill, Stroke, Appearance, Effects and Text in the Design panel. Draw a new Frame (F) or Text (T) on the canvas.
- A change made in the Desktop view applies at every width, except at a breakpoint where you have already changed that property in its own view; one made in the Tablet or Phone view applies only at that view's breakpoint.
- With nothing selected, the Design panel lists the project's Variables.
- When the Design panel cannot say what you want, pick the Brief tool (B) and click the layer: write what the Agent should achieve there on its card, which sits beside the views with a dashed line to the layer.
- Click the full screen button at the top right of a view to see the canvas at full size, at that view's width; press Esc to come back.

Every change is saved into the project as you go. The ✕ at the top right of the Design panel (Back to preview mode) takes you back to preview mode, where the page shows the code as it is; a badge on the toggle counts the changes not applied yet. Click the badge to see them, undo any one of them, or Discard all.

### 3. Let the Agent apply them

Tell your Agent:

> Apply my design changes

The Agent claims the round: edit mode closes if it is open, the toggle locks, and the ring around it fills as each change shows on the page. When the Agent is done, the page is the real result, in code.

If the Agent stops partway, the toggle tells you "Your Agent seems to have stopped". Tell your Agent "Continue applying my design changes", or click End this round (pressing and holding the toggle does the same). Changes not applied yet stay for the next round, on the same canvas.

### 4. Read the report

The Agent ends its reply with a report of the round. Under ✓ are the changes applied as you made them; under ↪ those it did differently on purpose (you asked for something else in the conversation, say, or it adapted a change at a narrower view's width), each with why; under ⚠️ those the page does not show, each with why and what it did instead. For each change the page can check, what the page shows decides its heading, unless the Agent says it did it differently on purpose: then it is under ↪, with its reason.

```text
✓ Applied
- 1. Fill: the cards of the feature grid, white → red
- 2. Brief on Button: pressed, it shrinks a little and springs back (`active:scale-95` with a springy transition)

↪ Done differently
- 3. Fill: the hero's background
  Why: you asked for neutral-250 instead

⚠️ Not shown
- 4. Corner radius: the Sign up button
  Why: the component library sets it, and it cannot be changed from this usage
  Instead: left as it was
```

To undo the last round, tell your Agent "Undo the last round of design changes".

## Remove Human Touch

Tell your Agent to remove Human Touch, or run this in the project's root folder:

```sh
npx humantouch remove
```

It takes back out everything `init` added, uninstalls the package and deletes `.humantouch/`, with any off-canvas layers, leaving `git diff` empty. In a project that uses npm and has no off-canvas layers, it prints:

```text
Human Touch removed:
- Took the plugin, <HumanTouch />, the Skill and its lines in AGENTS.md and .gitignore back out
- Deleted .humantouch/
- Uninstalled humantouch (`npm uninstall humantouch`)
```

With two off-canvas layers, the second item reads "Deleted .humantouch/, with the 2 layers the designer had moved off the canvas" instead.

If the lines `init` added have been changed since, it leaves them as they are and prints "Finish by hand" with what to take out. It does not remove anything while you have design changes not applied yet, or while your Agent is applying a round: apply them or discard them first.

## License

MIT, © 2026 Zby9999. See the LICENSE file.
