import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { iconAlias } from "./icon-alias.ts";

const DEV_API_URL = "http://localhost:3000";

const config = defineConfig({
  resolve: { alias: [iconAlias], tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    viteReact(),
  ],
  server: {
    port: 3001,
    proxy: { "^/api/": DEV_API_URL, "^/health$": DEV_API_URL },
    strictPort: true,
  },
});

export default config;
