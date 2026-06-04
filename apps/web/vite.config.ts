import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";

// Plain Vite SPA — builds fully static output for GitHub Pages. BASE_PATH is set
// in CI to the repo subpath (e.g. "/cheap-cloud/"); dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] }), react()],
  server: { port: 3000 },
});
