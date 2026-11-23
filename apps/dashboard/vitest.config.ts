import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { iconAlias } from "./icon-alias.ts";

export default defineConfig({
  plugins: [viteReact()],
  resolve: { alias: [iconAlias] },
  test: {
    environment: "happy-dom",
    server: { deps: { inline: ["@cloudflare/kumo"] } },
    setupFiles: ["./src/test-setup.ts"],
  },
});
