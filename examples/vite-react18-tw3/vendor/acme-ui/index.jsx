// Ships untranspiled JSX on purpose: excluded from pre-bundling, it passes
// through Vite plugins, so the example checks that dependencies stay unmarked.
// Passes its props on to the element it renders, as motion.div and Radix primitives do.
export function Surface(props) {
  return <div {...props} />;
}

export function Badge({ children }) {
  return (
    <span data-testid="acme-badge" className="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-2 py-0.5 text-caption text-brand-700">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-brand-500" />
      {children}
    </span>
  );
}
