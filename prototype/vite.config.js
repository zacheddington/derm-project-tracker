import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from /<repo-name>/, so the build needs
// a matching base path. The workflow sets BASE_PATH from the repo name, so
// renaming the repo does not silently break every asset URL.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  build: { outDir: "dist" },
  test: {
    // Node by default: the pure logic in src/lib needs no DOM and starts
    // faster without one. Component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock at the top of the file —
    // environmentMatchGlobs was removed in vitest 3, so the docblock is
    // the supported way to mix environments in one run.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
  },
});
