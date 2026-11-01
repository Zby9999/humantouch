---
name: 03kind
description: Apply the design changes a designer made in Vernier Kit, the editor layer on this project's dev server, to the source code. Use when the designer asks to apply their design changes ("apply my design changes", "落地我的设计改动"), or to undo the last round of them.
---

# Applying Vernier Kit design changes

The designer edits the page in Vernier Kit, which saves every change to `.03kind/` in the project. You write those changes into the source code. The command line gives you everything: what each change is, where it goes, and how to write it.

1. **Claim.** From the project root, run `npx 03kind claim`. It claims the round and prints the change notes: a numbered section per change, then **How to write them**, the rules for the kinds of change in this round. The designer's editor locks while you work. If it says there are no design changes to apply, tell the designer and stop. Running `claim` again prints the notes for the changes not applied yet.
2. **Apply** the changes in order, as their sections and the rules say. If one cannot be applied exactly as asked, apply the closest you can and still run `done` for it, or leave it out and do not; report it either way.
3. **Done.** After a change, or a group of related ones, run `npx 03kind done <number> …` with their numbers (`npx 03kind done 1 2 3`), and run it at least once before `finish`. For each change it says what the designer's open page shows:
   - **it shows the change**: go on.
   - **it does not show the change**: something overrides your edit, at the width it names. Fix what sets the value there, and run `done` with that number again. Go on once it shows, or once you know it cannot: then report it.
   - **Not checked**: the page cannot tell this kind of change, or could not look. It is not an error: go on.
4. **Finish.** When you have been through every change, run `npx 03kind finish`. It ends the round and unlocks the editor, and lays out the report for the round: each change under the heading the page's checks put it under, with what the page shows of those it does not.
5. **Report.** End your reply with that report, filled in. Its form:

```
✓ Applied
- 1. Fill: the cards of the feature grid, white → red
- 2. Brief on Button: pressed, it shrinks a little and springs back (`active:scale-95` with a springy transition)

⚠️ Not applied 1:1
- 3. Corner radius: <which layer>
  Why: <the reason, e.g. the component library sets it and cannot be changed from the usage>
  Instead: <what you did, or “left as it was”>
```

- List every change once, under one heading only. One applied, but not exactly as asked, goes under ⚠️ alone, not under ✓ as well; more to say of one applied exactly goes on its ✓ line.
- Give each change under ⚠️ both lines, Why and Instead.
- Leave the ⚠️ section out only when every change was applied exactly. Keep each line short.

## Undoing the last round

When the designer asks to undo the last round of design changes, run `npx 03kind last`. It prints the notes of the round before, each change marked **Applied** or **Not applied**, and, in a git repository, the exact code changes of that round and a command that takes them back out. Do as it says, then tell the designer what you reverted. There is nothing to claim or finish for an undo.

## Removing Vernier Kit

When the designer or a developer asks to remove or uninstall Vernier Kit, run `npx 03kind remove` from the project root, and do as it says: it takes back out everything `init` added and deletes `.03kind/`. While the designer has design changes not applied yet, it refuses: ask whether to apply them first or have the designer discard them.
