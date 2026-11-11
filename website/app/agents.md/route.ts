import { agentsMarkdown } from "@/lib/readme";

export const dynamic = "force-static";

/** The For Agents page as plain Markdown, for an Agent to fetch. */
export function GET() {
  return new Response(agentsMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
