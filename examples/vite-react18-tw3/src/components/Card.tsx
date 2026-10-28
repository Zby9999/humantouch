export function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-card border border-brand-100 bg-white p-gutter shadow-card">
      <h3 className="text-lead font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-caption text-muted">{body}</p>
    </article>
  );
}
