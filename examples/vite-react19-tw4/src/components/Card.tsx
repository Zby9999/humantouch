export function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className={title === "Your turn" ? "rounded-xl border border-stone-200 bg-white p-5 shadow-sm" : "rounded-xl border border-stone-200 bg-[#ff0000] p-5 shadow-sm"}>
      <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mt-2 text-sm text-stone-600">{body}</p>
    </article>
  );
}
