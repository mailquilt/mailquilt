import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiLive } from "@repo/api";
import { PostgresPortsLive } from "@repo/runtime-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* httpServer() {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000));

    return NodeHttpServer.layer(createServer, { port });
  })
);

const ServerLive = HttpRouter.serve(
  ApiLive.pipe(HttpRouter.provideRequest(PostgresPortsLive))
).pipe(Layer.provide(HttpServerLive));

NodeRuntime.runMain(Layer.launch(ServerLive));
