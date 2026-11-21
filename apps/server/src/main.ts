import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiLive } from "@repo/api";
import { PostgresPortsLive } from "@repo/runtime-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/http";

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

const ServerLive = HttpRouter.serve(
  Layer.mergeAll(
    ApiLive.pipe(HttpRouter.provideRequest(PostgresPortsLive)),
    DashboardLive
  )
).pipe(Layer.provide(HttpServerLive));

NodeRuntime.runMain(Layer.launch(ServerLive));
