/** Joins class names, leaving out the ones a condition turned off: the `cn()` many Tailwind projects have (shadcn/ui's, without tailwind-merge). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
