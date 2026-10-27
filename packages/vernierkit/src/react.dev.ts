import { useEffect } from "react";
import { mountEditorLayer } from "./client/mount";
import { SERVICE_GLOBAL } from "./service-protocol";

/** Mounts the editor layer. Put it once in the root component. */
export function Vernier(): null {
  useEffect(() => {
    const window_ = window as unknown as Record<string, unknown>;
    const fromBundle = serviceFromBundle();
    if (fromBundle && !window_[SERVICE_GLOBAL]) window_[SERVICE_GLOBAL] = JSON.parse(fromBundle);
    return mountEditorLayer();
  }, []);
  return null;
}

/**
 * Where the local service is, as `withVernier()` hands it to Next.js's
 * bundler: written out in full (`SERVICE_ENV`), so the bundler can put the
 * value in its place. Under Vite there is no `process`: the page has the
 * global already.
 */
function serviceFromBundle(): string | undefined {
  try {
    return process.env.VERNIERKIT_SERVICE;
  } catch {
    return undefined;
  }
}
