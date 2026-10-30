import { avatar, picture } from "./images";

const ADJECTIVES = ["Linen", "Walnut", "Cobalt", "Amber", "Slate", "Juniper", "Copper", "Ivory"];
const NOUNS = ["Lamp", "Chair", "Mug", "Throw", "Vase", "Desk", "Shelf", "Clock", "Rug", "Stool", "Planter", "Tray"];
const TAGS = ["New", "Bestseller", "Eco", "Limited", "Handmade", "Sale"];
const NAMES = ["Ada Park", "Ben Ortiz", "Chen Wei", "Dana Kim", "Eli Novak", "Fatima Noor", "Gus Lund", "Hana Sato", "Ivan Petrov", "Jo Mensah"];
const STATUSES = [
  { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  { label: "Invited", className: "bg-brand-50 text-brand-700" },
  { label: "Paused", className: "bg-amber-50 text-amber-700" },
];
const CATEGORIES = ["Guides", "News", "Design", "Shipping", "Stories"];

export function StatTile({ label, index }: { label: string; index: number }) {
  const up = index % 3 !== 1;
  return (
    <article className="flex flex-col gap-2 rounded-card bg-white p-gutter shadow-card">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-card bg-brand-50" aria-hidden="true" />
        <span className="text-caption text-muted">{label}</span>
      </div>
      <p className="text-display font-bold">{(index + 3) * 1280}</p>
      <p className="text-caption text-muted">
        <span className={up ? "text-emerald-600" : "text-rose-600"}>{up ? "+" : "−"}{(index % 5) + 2}.4%</span> vs last week
      </p>
      <div className="h-1.5 rounded-pill bg-brand-50">
        <div className="h-1.5 rounded-pill bg-brand-500" style={{ width: `${30 + ((index * 13) % 60)}%` }} />
      </div>
    </article>
  );
}

export function ProductCard({ index }: { index: number }) {
  const name = `${ADJECTIVES[index % ADJECTIVES.length]} ${NOUNS[index % NOUNS.length]}`;
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-brand-100 bg-white shadow-card" data-testid="product">
      <div className="relative">
        <img src={picture(index, 240, 160)} alt="" width={240} height={160} className="h-40 w-full object-cover" />
        {index % 4 === 0 && <span className="absolute left-2 top-2 rounded-pill bg-white px-2 text-caption">{TAGS[index % TAGS.length]}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-gutter">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{name}</h3>
          <span className="text-caption font-semibold text-brand-700">${(index % 9) * 12 + 19}</span>
        </div>
        <p className="text-caption text-muted">Made in small batches, finished by hand, and shipped in recycled packaging.</p>
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="rounded-pill bg-slate-100 px-2 text-caption text-muted">
              {TAGS[(index + i) % TAGS.length]}
            </span>
          ))}
        </div>
        <div className="mt-auto flex gap-2">
          <button type="button" className="flex-1 rounded-pill bg-brand-500 px-3 py-1 text-caption text-white">
            Edit
          </button>
          <button type="button" className="rounded-pill border border-slate-200 px-3 py-1 text-caption">
            Share
          </button>
        </div>
      </div>
    </article>
  );
}

export function UserRow({ index }: { index: number }) {
  const name = NAMES[index % NAMES.length];
  const status = STATUSES[index % STATUSES.length];
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <img src={avatar(index)} alt="" width={32} height={32} className="h-8 w-8 rounded-pill" />
          <div className="flex flex-col">
            <p className="font-semibold">{name}</p>
            <p className="text-muted">{name.split(" ")[0].toLowerCase()}{index}@example.com</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">{(index * 7) % 60}</td>
      <td className="px-3 py-2">${((index * 173) % 9000) + 120}</td>
      <td className="px-3 py-2">
        <span className={`rounded-pill px-2 py-0.5 ${status.className}`}>{status.label}</span>
      </td>
      <td className="px-3 py-2 text-muted">{2016 + (index % 10)}</td>
      <td className="px-3 py-2 text-right">
        <button type="button" className="rounded-pill border border-slate-200 px-2 text-caption">
          View
        </button>
      </td>
    </tr>
  );
}

export function ArticleCard({ index }: { index: number }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
      <img src={picture(index + 200, 360, 200)} alt="" width={360} height={200} className="h-44 w-full object-cover" />
      <div className="flex flex-col gap-2 p-gutter">
        <div className="flex items-center gap-2 text-caption text-muted">
          <span className="font-semibold text-brand-700">{CATEGORIES[index % CATEGORIES.length]}</span>
          <span>{(index % 27) + 1} Oct 2026</span>
        </div>
        <h3 className="text-lead font-semibold">Ten small changes that made our checkout faster, number {index + 1}</h3>
        <p className="text-caption text-muted">What we measured, what we tried, and the three changes customers noticed first.</p>
        <div className="flex items-center gap-2">
          <img src={avatar(index + 50)} alt="" width={24} height={24} className="h-6 w-6 rounded-pill" />
          <span className="text-caption">{NAMES[(index + 3) % NAMES.length]}</span>
        </div>
        <a href={`#article-${index}`} className="text-caption font-semibold text-brand-700">
          Read more
        </a>
      </div>
    </article>
  );
}

export function Testimonial({ index }: { index: number }) {
  const name = NAMES[(index + 5) % NAMES.length];
  return (
    <figure className="flex min-w-64 flex-1 basis-64 flex-col gap-3 rounded-card bg-white p-gutter shadow-card">
      <blockquote className="text-caption">
        <p>“The store finally feels like ours. Orders went up the week we switched, and support tickets went down.”</p>
      </blockquote>
      <figcaption className="flex items-center gap-2">
        <img src={avatar(index + 90)} alt="" width={32} height={32} className="h-8 w-8 rounded-pill" />
        <div className="flex flex-col">
          <span className="text-caption font-semibold">{name}</span>
          <span className="text-caption text-muted">Store owner</span>
        </div>
      </figcaption>
    </figure>
  );
}
