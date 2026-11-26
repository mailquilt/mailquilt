import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { iconAlias } from "./icon-alias.ts";

const DEV_API_URL = "http://localhost:3000";

const PUBLIC_PAGES_STYLESHEET = "public-pages.css";

const APP_STYLESHEET = /^assets\/styles-[\w-]+\.css$/u;

// WARNING: pages the server renders, such as unsubscribe, link the dashboard's stylesheet under this fixed name (packages/api/src/unsubscribe/pages.ts); rename both together.
const publicPagesStylesheet = () =>
  ({
    configureServer: (server) => {
      server.middlewares.use(
        `/${PUBLIC_PAGES_STYLESHEET}`,
        async (_, response, next) => {
          try {
            const result = await server.transformRequest(
              "/src/styles.css?direct"
            );

            response.setHeader("Content-Type", "text/css");
            response.end(result?.code ?? "");
          } catch (error) {
            return next(error);
          }
        }
      );
    },
    generateBundle(_, bundle) {
      const stylesheet = Object.values(bundle).find(
        (output) =>
          output.type === "asset" && APP_STYLESHEET.test(output.fileName)
      );

      if (stylesheet?.type === "asset") {
        this.emitFile({
          fileName: PUBLIC_PAGES_STYLESHEET,
          source: stylesheet.source,
          type: "asset",
        });
      }
    },
    name: "mailquilt-public-pages-stylesheet",
  }) satisfies Plugin;

const config = defineConfig({
  resolve: { alias: [iconAlias], tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    viteReact(),
    publicPagesStylesheet(),
  ],
  server: {
    port: 3001,
    proxy: {
      "^/api/": DEV_API_URL,
      "^/health$": DEV_API_URL,
      "^/unsubscribe": DEV_API_URL,
    },
    strictPort: true,
  },
});

export default config;
