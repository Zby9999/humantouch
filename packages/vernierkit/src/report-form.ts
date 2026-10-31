/** The report the Agent ends its reply with (ticket 65). */
/**
 * As `finish` gives it and the Skill has it, word for word: the designer
 * reads only the exceptions, so every change is listed once, under one
 * heading, and each under ⚠️ says why and what was done instead.
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
