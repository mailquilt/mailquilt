import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiLive, AuthConfigFromEnv } from "@repo/api";
import {
  SystemMailerAfterResponding,
  SystemMailerConfigFromEnv,
  SystemMailerLive,
} from "@repo/core";
import {
  CloudflareEmailProviderLive,
  DnsFromEnv,
  EmailLinksFromEnv,
  migrateOnBoot,
  PostgresPortsLive,
  QueueWorkersLive,
  SesNotificationsLive,
  SesProviderLive,
  SmtpProviderLive,
} from "@repo/runtime-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http";

const DASHBOARD_DIR = fileURLToPath(
  new URL("../../dashboard/dist/client", import.meta.url)
);

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* httpServer() {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000));

    return NodeHttpServer.layer(createServer, { port });
  })
);

const DashboardLive = Layer.mergeAll(
  HttpRouter.add("*", "/api/*", HttpServerResponse.empty({ status: 404 })),
  HttpStaticServer.layer({
    cacheControl: "no-cache",
    root: DASHBOARD_DIR,
    spa: true,
  }),
  HttpStaticServer.layer({
    cacheControl: "public, max-age=31536000, immutable",
    prefix: "/assets",
    root: `${DASHBOARD_DIR}/assets`,
  })
);

const PortsLive = SystemMailerAfterResponding.pipe(
  Layer.provide(SystemMailerLive),
  Layer.provideMerge(
    Layer.mergeAll(
      CloudflareEmailProviderLive,
      DnsFromEnv,
      EmailLinksFromEnv,
      PostgresPortsLive,
      SesNotificationsLive,
      SesProviderLive,
      SmtpProviderLive,
      SystemMailerConfigFromEnv
    )
  )
);

const ServerLive = HttpRouter.serve(
  Layer.mergeAll(
    ApiLive.pipe(
      HttpRouter.provideRequest(
        Layer.mergeAll(
          Layer.effectContext(
            Effect.context<Layer.Success<typeof PortsLive>>()
          ),
          AuthConfigFromEnv
        )
      )
    ),
    DashboardLive
  )
).pipe(Layer.provide(HttpServerLive));

const AppLive = Layer.mergeAll(ServerLive, QueueWorkersLive).pipe(
  Layer.provide(PortsLive)
);

NodeRuntime.runMain(migrateOnBoot.pipe(Effect.andThen(Layer.launch(AppLive))));
