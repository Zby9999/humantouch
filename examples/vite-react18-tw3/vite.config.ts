import react from "@vitejs/plugin-react";
import humanTouch from "humantouch-dev/vite";
import { defineConfig } from "vite";

// Tailwind v3 runs as a PostCSS plugin: see postcss.config.js and tailwind.config.js.
export default defineConfig({
  plugins: [humanTouch(), react()],
  // Serve the stand-in third-party library unbundled so it goes through the plugins.
  optimizeDeps: { exclude: ["acme-ui"] },
});
