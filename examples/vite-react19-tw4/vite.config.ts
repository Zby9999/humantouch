import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import thirdKind from "03kind/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [thirdKind(), react(), tailwindcss()],
  // Serve the stand-in third-party library unbundled so it goes through the plugins.
  optimizeDeps: { exclude: ["acme-ui"] },
});
