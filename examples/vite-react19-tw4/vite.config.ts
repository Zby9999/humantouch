import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import humanTouch from "humantouch-dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [humanTouch(), react(), tailwindcss()],
  // Serve the stand-in third-party library unbundled so it goes through the plugins.
  optimizeDeps: { exclude: ["acme-ui"] },
});
