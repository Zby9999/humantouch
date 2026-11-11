import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { agentsMarkdown } from "@/lib/readme";

export const metadata: Metadata = {
  title: "Human Touch, for Agents",
  description: "How a coding Agent installs Human Touch, applies the designer's changes, and removes it.",
};

/** The Markdown, shown as Markdown on black: headings, lists and code tinted, the rest as written. */
export default function AgentsPage() {
  const markdown = agentsMarkdown();
  return (
    <main className="min-h-screen bg-neutral-950 px-4 pt-[120px] pb-[184px] text-neutral-300 md:pt-[160px]">
      <div className="mx-auto flex max-w-[800px] flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[12px] text-neutral-500">
            <a href="/agents.md" className="hover:text-neutral-300">agents.md</a>
          </p>
          <CopyButton text={markdown} label="Copy Markdown" className="!bg-neutral-800 !text-neutral-100" />
        </div>
        <pre className="font-mono text-[13px] leading-[1.7] break-words whitespace-pre-wrap">
          {markdown.split("\n").map((line, i) => (
            <Line key={i} line={line} />
          ))}
        </pre>
      </div>
    </main>
  );
}

function Line({ line }: { line: string }) {
  if (/^#{1,3} /.test(line)) return <span className="text-neutral-50">{line}{"\n"}</span>;
  if (/^```/.test(line)) return <span className="text-neutral-600">{line}{"\n"}</span>;
  return (
    <span>
      {line.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <span key={i} className="text-[#7cc4ff]">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      {"\n"}
    </span>
  );
}
