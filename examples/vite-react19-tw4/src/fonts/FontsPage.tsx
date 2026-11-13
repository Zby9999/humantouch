import { HumanTouch } from "humantouch-dev/react";

/**
 * A page whose web font the project declares in three weights, Light, Medium
 * and Bold, each in several unicode-range subsets, as Fontsource and
 * next/font write them, while its text uses Medium only: the browser loads
 * that one alone (ticket 140).
 */
export function FontsPage() {
  return (
    <main className="fonts-page">
      <h1>Declared weights</h1>
      <p>Only the title uses the web font, in one of its weights.</p>
      <HumanTouch />
    </main>
  );
}
