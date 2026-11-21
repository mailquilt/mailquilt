import { Empty, Text } from "@cloudflare/kumo";
import { CompassIcon } from "@phosphor-icons/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  HeadContent,
  Link,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { AccountMenu } from "../auth/account-menu.tsx";
import { ThemePicker } from "../theme/theme-picker.tsx";
import { themeScript } from "../theme/theme.ts";

import appCss from "../styles.css?url";

const NotFound = () => (
  <Empty
    contents={<Link to="/">Go to the dashboard</Link>}
    description="There is no page at this address."
    icon={<CompassIcon size={48} />}
    title="Page not found"
  />
);

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <head>
      <ScriptOnce>{themeScript}</ScriptOnce>
      <HeadContent />
    </head>
    <body className="bg-kumo-canvas text-kumo-default">
      <header className="flex items-center justify-between gap-4 border-b border-kumo-line bg-kumo-base px-6 py-3">
        <Text as="span" variant="heading">
          Mailquilt
        </Text>
        <div className="flex items-center gap-4">
          <AccountMenu />
          <ThemePicker />
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
      <TanStackDevtools
        config={{
          position: "bottom-right",
        }}
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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Mailquilt",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});
