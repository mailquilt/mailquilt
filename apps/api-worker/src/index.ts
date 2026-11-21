import { ApiLive } from "@repo/api";
import { postgresPortsLive, providePerRequest } from "@repo/runtime-cloudflare";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
}

const makeApp = (env: Env) =>
  HttpRouter.toWebHandler(
    ApiLive.pipe(
      providePerRequest(postgresPortsLive(env.HYPERDRIVE)),
      Layer.provide(HttpServer.layerServices),
      Layer.provide(Layer.effectDiscard(Effect.logInfo("Runtime built")))
    )
  );

// WARNING: built once per isolate on the first request; Hyperdrive bindings can't be read at module load.
let app: ReturnType<typeof makeApp> | undefined;

export default {
  fetch(request, env) {
    app ??= makeApp(env);

    return app.handler(request);
  },
} satisfies ExportedHandler<Env>;
