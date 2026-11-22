import { ApiLive, authConfigLayer } from "@repo/api";
import { SystemMailerNotConfigured } from "@repo/core";
import {
  postgresPortsLive,
  providePerRequest,
  SmtpProviderUnavailable,
} from "@repo/runtime-cloudflare";
import { Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
  /** Where the dashboard is served, such as `https://mail.example.com`. */
  readonly APP_URL: string;
  /** A secret, set with `wrangler secret put AUTH_SECRET` (`.dev.vars` locally). */
  readonly AUTH_SECRET: string;
  /** Keys that seal Provider Connection credentials, a secret like AUTH_SECRET (ADR 0009). Unset, every request fails saying so. */
  readonly ENCRYPTION_KEYS?: string;
}

// WARNING: trust only `cf-connecting-ip`, which Cloudflare sets itself; a client can forge any other IP header.
const authConfigLive = (env: Env) =>
  authConfigLayer({
    appUrl: env.APP_URL,
    clientIpHeader: Option.some("cf-connecting-ip"),
    secret: Redacted.make(env.AUTH_SECRET),
  });

const makeApp = (env: Env) =>
  HttpRouter.toWebHandler(
    ApiLive.pipe(
      providePerRequest(
        postgresPortsLive(
          env.HYPERDRIVE,
          Redacted.make(env.ENCRYPTION_KEYS ?? "")
        )
      ),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          authConfigLive(env),
          SmtpProviderUnavailable,
          SystemMailerNotConfigured
        )
      ),
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
