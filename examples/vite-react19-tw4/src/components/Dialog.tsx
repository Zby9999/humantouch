export function Dialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-stone-900/40">
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-80 rounded-xl bg-white p-6 shadow-xl">
        <h2 id="dialog-title" className="text-lg font-semibold text-stone-900">
          Ship it?
        </h2>
        <p className="mt-2 text-sm text-stone-600">Freeze the page with this dialog open to edit it.</p>
        <button type="button" className="mt-4 px-3 py-1.5 text-sm text-white" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
