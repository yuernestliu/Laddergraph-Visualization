import { defineConfig } from "vite";

export default defineConfig({
  base: "/Laddergraph-Visualization/",
  assetsInclude: ["**/*.gv", "**/*.dot", "**/*.csv"],
  build: {
    target: "es2022",
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    exclude: ["**/_FORBIDDEN_*", "**/_FORBIDDEN_*/**"],
  },
});
