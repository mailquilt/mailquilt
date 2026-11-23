import { LinkProvider } from "@cloudflare/kumo";
import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import spaceGrotesk from "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url";
import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { NotFound } from "../layout/not-found.tsx";
import { RouterLink } from "../layout/router-link.tsx";
import { themeScript } from "../theme/theme.ts";

import appCss from "../styles.css?url";

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html data-theme="mailquilt" lang="en" suppressHydrationWarning>
    <head>
      <ScriptOnce>{themeScript}</ScriptOnce>
      <HeadContent />
    </head>
    <body className="bg-(--mq-frame) text-kumo-default">
      {children}
      <TanStackDevtools
        config={{ position: "bottom-right" }}
        plugins={[
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
      <Scripts />
    </body>
  </html>
);

const Root = () => (
  <LinkProvider component={RouterLink}>
    <Outlet />
  </LinkProvider>
);

export const Route = createRootRoute({
  component: Root,
  head: () => ({
    links: [
      // WARNING: preload only the font files the pages draw with (styles.css's fonts, Latin); an unused preload is a wasted download.
      {
        as: "font",
        crossOrigin: "anonymous",
        href: instrumentSans,
        rel: "preload",
        type: "font/woff2",
      },
      {
        as: "font",
        crossOrigin: "anonymous",
        href: spaceGrotesk,
        rel: "preload",
        type: "font/woff2",
      },
      { href: appCss, rel: "stylesheet" },
      { href: "/favicon.ico", rel: "icon", sizes: "any" },
      { href: "/favicon.svg", rel: "icon", type: "image/svg+xml" },
      { href: "/apple-touch-icon.png", rel: "apple-touch-icon" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "Mailquilt" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});
