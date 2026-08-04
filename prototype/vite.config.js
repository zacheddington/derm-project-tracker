import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from /<repo-name>/, so the build needs
// a matching base path. The workflow sets BASE_PATH from the repo name, so
// renaming the repo does not silently break every asset URL.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  build: { outDir: "dist" },
});
