import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import astro from "ultracite/oxlint/astro";
import vitest from "ultracite/oxlint/vitest";
import playwright from "ultracite/oxlint/playwright";
import shadcn from "ultracite/oxlint/shadcn";
import landmines from "ultracite/oxlint/landmines";
import antiSlop from "ultracite/oxlint/anti-slop";

export default defineConfig({
  env: core.env,
  extends: [
    core,
    react,
    tanstack,
    astro,
    vitest,
    playwright,
    shadcn,
    landmines,
    antiSlop,
  ],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: [...shadcn.jsPlugins, ...landmines.jsPlugins],
});
