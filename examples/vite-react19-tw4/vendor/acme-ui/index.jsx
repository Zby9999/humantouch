// Ships untranspiled JSX on purpose: excluded from pre-bundling, it passes
// through Vite plugins, so the example checks that dependencies stay unmarked.
export function Badge({ children }) {
  return (
    <span data-testid="acme-badge" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
      {children}
    </span>
  );
}
