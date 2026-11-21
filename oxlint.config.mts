import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import astro from "ultracite/oxlint/astro";
import core from "ultracite/oxlint/core";
import landmines from "ultracite/oxlint/landmines";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

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
