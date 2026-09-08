import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the static build works from any path or custom domain. The workspace
// crypto packages ship ESM dist and are bundled straight in; no backend, no server routes.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", target: "es2020" },
});
