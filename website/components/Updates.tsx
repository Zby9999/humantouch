import { UPDATES } from "@/lib/updates";

/** The changelog's entries, as cards: the title and its date on top, the line on what it does at the foot. */
export function Updates({ count }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {UPDATES.slice(0, count).map((update) => (
        <li key={update.title} className="flex h-[120px] flex-col justify-between rounded-[4px] bg-surface p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[16px] leading-[1.4] font-[500] tracking-[-0.04px] text-ink">{update.title}</h3>
            <time dateTime={update.date} className="font-mono text-[12px] text-label">
              {update.date}
            </time>
          </div>
          <p className="truncate text-[14px] leading-[1.4] font-[440] text-label">
            {update.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
