import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiLive, AuthConfigFromEnv } from "@repo/api";
import { SystemMailerConfigFromEnv, SystemMailerLive } from "@repo/core";
import { PostgresPortsLive, SmtpProviderLive } from "@repo/runtime-node";
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

const PortsLive = SystemMailerLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      PostgresPortsLive,
      SmtpProviderLive,
      SystemMailerConfigFromEnv
    )
  )
);

const ServerLive = HttpRouter.serve(
  Layer.mergeAll(
    ApiLive.pipe(
      HttpRouter.provideRequest(Layer.mergeAll(PortsLive, AuthConfigFromEnv))
    ),
    DashboardLive
  )
).pipe(Layer.provide(HttpServerLive));

NodeRuntime.runMain(Layer.launch(ServerLive));
