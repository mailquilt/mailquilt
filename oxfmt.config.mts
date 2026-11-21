import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  astro: true,
  ignorePatterns: [...ultracite.ignorePatterns, ".agents/**", ".claude/**"],
  sortTailwindcss: {
    ...ultracite.sortTailwindcss,
    stylesheet: "./apps/dashboard/src/styles.css",
  },
});
